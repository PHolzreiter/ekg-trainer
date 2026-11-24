//! EKG-Trainer – lokaler Server.
//! Liefert Steuerpult (/host, nur von diesem Computer), Beamer (/beamer.html) und die Teilnehmerseite (/) aus
//! und verteilt Nachrichten des Hosts per WebSocket an alle Teilnehmer im selben Netz.
#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "console")]

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        ConnectInfo, Query, State,
    },
    http::{header, StatusCode, Uri},
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use futures_util::{SinkExt, StreamExt};
use rand::Rng;
use rust_embed::RustEmbed;
use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, HashMap},
    net::{IpAddr, SocketAddr},
    sync::Arc,
};
use tokio::sync::{mpsc, Mutex};

#[derive(RustEmbed)]
#[folder = "../web/"]
struct Web;

type Tx = mpsc::UnboundedSender<Message>;

#[derive(Default)]
struct Room {
    host: Option<Tx>,
    peers: BTreeMap<u64, (String, Tx)>,
    stored: BTreeMap<String, String>,
}

struct App {
    room: String,
    key: String,
    port: u16,
    state: Mutex<Room>,
    next_id: Mutex<u64>,
}

fn code(n: usize, abc: &[u8]) -> String {
    let mut r = rand::thread_rng();
    (0..n).map(|_| abc[r.gen_range(0..abc.len())] as char).collect()
}

fn lan_urls(port: u16) -> Vec<String> {
    let mut v: Vec<String> = Vec::new();
    if let Ok(ip) = local_ip_address::local_ip() {
        v.push(format!("http://{}:{}", ip, port));
    }
    if let Ok(list) = local_ip_address::list_afinet_netifas() {
        for (_, ip) in list {
            if let IpAddr::V4(a) = ip {
                if a.is_loopback() || a.is_link_local() {
                    continue;
                }
                let u = format!("http://{}:{}", a, port);
                if !v.contains(&u) {
                    v.push(u);
                }
            }
        }
    }
    v
}

fn asset(path: &str) -> Response {
    match Web::get(path) {
        Some(f) => {
            let mime = mime_guess::from_path(path).first_or_octet_stream();
            ([(header::CONTENT_TYPE, mime.as_ref().to_string()), (header::CACHE_CONTROL, "no-cache".into())], f.data.into_owned()).into_response()
        }
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

async fn files(ConnectInfo(addr): ConnectInfo<SocketAddr>, uri: Uri) -> Response {
    let p = uri.path().trim_start_matches('/');
    let local = addr.ip().is_loopback();
    match p {
        "" | "index.html" => asset("index.html"),
        "host" | "host.html" | "host.js" | "beamer.html" | "ekg-engine.js" | "ekg-lib.js" | "heart3d.js" | "vendor/three.min.js" if !local => {
            // Lösung und Generator bleiben auf dem Host-Computer
            StatusCode::FORBIDDEN.into_response()
        }
        "host" => asset("host.html"),
        _ => asset(p),
    }
}

async fn info(ConnectInfo(addr): ConnectInfo<SocketAddr>, State(app): State<Arc<App>>) -> Response {
    if !addr.ip().is_loopback() {
        return StatusCode::FORBIDDEN.into_response();
    }
    Json(json!({"room": app.room, "key": app.key, "port": app.port, "urls": lan_urls(app.port)})).into_response()
}

async fn room(State(app): State<Arc<App>>) -> Response {
    Json(json!({"room": app.room})).into_response()
}

async fn ws(ws: WebSocketUpgrade, Query(q): Query<HashMap<String, String>>, State(app): State<Arc<App>>) -> Response {
    let role = q.get("role").cloned().unwrap_or_default();
    let room_ok = q.get("room").map(|r| r.eq_ignore_ascii_case(&app.room)).unwrap_or(false);
    let key_ok = q.get("key").map(|k| *k == app.key).unwrap_or(false);
    ws.on_upgrade(move |sock| async move {
        if role == "host" && key_ok && room_ok {
            host_conn(sock, app).await
        } else if role == "view" && room_ok {
            peer_conn(sock, app).await
        } else {
            reject(sock).await
        }
    })
}

async fn reject(mut sock: WebSocket) {
    let _ = sock
        .send(Message::Close(Some(axum::extract::ws::CloseFrame { code: 4003, reason: "abgelehnt".into() })))
        .await;
}

async fn peers_msg(room: &Room) -> String {
    let list: Vec<Value> = room.peers.iter().map(|(id, (n, _))| json!({"id": id, "name": n})).collect();
    json!({"t": "peers", "list": list}).to_string()
}

async fn notify_host(app: &Arc<App>) {
    let r = app.state.lock().await;
    if let Some(h) = &r.host {
        let _ = h.send(Message::Text(peers_msg(&r).await));
    }
}

async fn host_conn(sock: WebSocket, app: Arc<App>) {
    let (mut sink, mut stream) = sock.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();
    {
        let mut r = app.state.lock().await;
        r.host = Some(tx.clone());
        let _ = tx.send(Message::Text(peers_msg(&r).await));
    }
    let w = tokio::spawn(async move {
        while let Some(m) = rx.recv().await {
            if sink.send(m).await.is_err() {
                break;
            }
        }
    });
    while let Some(Ok(msg)) = stream.next().await {
        let Message::Text(txt) = msg else { continue };
        let Ok(v) = serde_json::from_str::<Value>(&txt) else { continue };
        let mut r = app.state.lock().await;
        if v.get("t").and_then(|t| t.as_str()) == Some("kick") {
            if let Some(id) = v.get("id").and_then(|i| i.as_u64()) {
                if let Some((_, ptx)) = r.peers.remove(&id) {
                    let _ = ptx.send(Message::Close(Some(axum::extract::ws::CloseFrame { code: 4001, reason: "entfernt".into() })));
                }
                if let Some(h) = &r.host {
                    let _ = h.send(Message::Text(peers_msg(&r).await));
                }
            }
            continue;
        }
        if let Some(k) = v.get("k").and_then(|k| k.as_str()) {
            r.stored.insert(k.to_string(), txt.clone());
        }
        for (_, (_, ptx)) in r.peers.iter() {
            let _ = ptx.send(Message::Text(txt.clone()));
        }
    }
    w.abort();
    let mut r = app.state.lock().await;
    if r.host.as_ref().map(|h| h.same_channel(&tx)).unwrap_or(false) {
        r.host = None;
    }
}

async fn peer_conn(sock: WebSocket, app: Arc<App>) {
    let (mut sink, mut stream) = sock.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();
    let id = {
        let mut n = app.next_id.lock().await;
        *n += 1;
        *n
    };
    {
        let mut r = app.state.lock().await;
        for (_, m) in r.stored.iter() {
            let _ = tx.send(Message::Text(m.clone()));
        }
        r.peers.insert(id, (String::new(), tx.clone()));
    }
    notify_host(&app).await;
    let w = tokio::spawn(async move {
        while let Some(m) = rx.recv().await {
            let close = matches!(m, Message::Close(_));
            if sink.send(m).await.is_err() || close {
                break;
            }
        }
    });
    while let Some(Ok(msg)) = stream.next().await {
        let Message::Text(txt) = msg else { continue };
        if txt.len() > 4000 {
            continue;
        }
        let Ok(mut v) = serde_json::from_str::<Value>(&txt) else { continue };
        if v.get("t").and_then(|t| t.as_str()) == Some("hello") {
            let name: String = v.get("name").and_then(|n| n.as_str()).unwrap_or("").chars().take(24).collect();
            {
                let mut r = app.state.lock().await;
                if let Some(p) = r.peers.get_mut(&id) {
                    p.0 = name;
                } else {
                    break;
                }
            }
            notify_host(&app).await;
        } else {
            v["from"] = json!(id);
            let r = app.state.lock().await;
            if let Some(h) = &r.host {
                let _ = h.send(Message::Text(v.to_string()));
            }
        }
    }
    w.abort();
    app.state.lock().await.peers.remove(&id);
    notify_host(&app).await;
}

#[tokio::main]
async fn main() {
    let no_open = std::env::args().any(|a| a == "--kein-browser");
    let mut listener = None;
    let mut port = 47800u16;
    for p in 47800..47830u16 {
        if let Ok(l) = tokio::net::TcpListener::bind(("0.0.0.0", p)).await {
            listener = Some(l);
            port = p;
            break;
        }
    }
    let Some(listener) = listener else {
        eprintln!("Kein freier Port zwischen 47800 und 47829 gefunden.");
        return;
    };
    let app = Arc::new(App {
        room: code(4, b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789"),
        key: code(24, b"abcdefghijkmnopqrstuvwxyz23456789"),
        port,
        state: Mutex::new(Room::default()),
        next_id: Mutex::new(0),
    });
    let router = Router::new()
        .route("/api/info", get(info))
        .route("/api/room", get(room))
        .route("/ws", get(ws))
        .fallback(files)
        .with_state(app.clone());
    let host_url = format!("http://localhost:{}/host", port);
    println!("EKG-Trainer läuft.\n  Steuerpult (dieser Computer): {}\n  Raumcode: {}", host_url, app.room);
    for u in lan_urls(port) {
        println!("  Teilnehmer im WLAN: {}", u);
    }
    println!("Dieses Fenster offen lassen. Beenden mit Strg+C.");
    if !no_open {
        let _ = open::that(&host_url);
    }
    axum::serve(listener, router.into_make_service_with_connect_info::<SocketAddr>()).await.unwrap();
}
