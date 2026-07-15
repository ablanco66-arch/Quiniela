"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

type Status = "available" | "reserved" | "paid";
type Role = "admin" | "user" | "treasury";
type FlyerType = "board" | "board-en" | "report" | "winner";
type Square = {
  id: number; status: Status; participant: string; contact: string; phone: string;
  reservedByEmail: string; reservedByName: string; reservedAt: string;
  paidByEmail: string; paidByName: string; paidAt: string;
};
type Member = { email: string; name: string; role: Role; active: number; username?: string; tempPassword?: string; mustChangePassword?: boolean; approvalStatus?: "pending" | "approved" | "suspended"; authProvider?: "local" | "chatgpt" };
type Activity = { id: number; squareId: number | null; action: string; actorName: string; actorRole: Role; previousStatus: string; newStatus: string; details: string; createdAt: string };
type Game = { date: string; visitor: string; home: string };
type GameResult = { gameId:number; visitorScore:number; homeScore:number; updatedByName?:string; updatedAt?:string };
type ReportRow = { name:string; reserved:number; paid:number; total:number };
type WinnerRow = { result:GameResult; game:Game; square:Square; visitorDigit:number; homeDigit:number };
type SquareReportSortKey = "square"|"visitor"|"home"|"player"|"seller"|"status";

const games: Game[] = [
  { date: "14 sep", visitor: "Denver Broncos", home: "Kansas City Chiefs" }, { date: "21 sep", visitor: "New York Giants", home: "Los Angeles Rams" },
  { date: "28 sep", visitor: "Philadelphia Eagles", home: "Chicago Bears" }, { date: "5 oct", visitor: "Atlanta Falcons", home: "New Orleans Saints" },
  { date: "12 oct", visitor: "Buffalo Bills", home: "Los Angeles Rams" }, { date: "19 oct", visitor: "Washington Commanders", home: "San Francisco 49ers" },
  { date: "26 oct", visitor: "Dallas Cowboys", home: "Philadelphia Eagles" }, { date: "2 nov", visitor: "Chicago Bears", home: "Seattle Seahawks" },
  { date: "9 nov", visitor: "Buffalo Bills", home: "Minnesota Vikings" }, { date: "16 nov", visitor: "Los Angeles Chargers", home: "Baltimore Ravens" },
  { date: "23 nov", visitor: "Cincinnati Bengals", home: "Washington Commanders" }, { date: "30 nov", visitor: "Carolina Panthers", home: "Tampa Bay Buccaneers" },
  { date: "7 dic", visitor: "Dallas Cowboys", home: "Seattle Seahawks" }, { date: "14 dic", visitor: "Pittsburgh Steelers", home: "Jacksonville Jaguars" },
  { date: "21 dic", visitor: "New England Patriots", home: "Kansas City Chiefs" }, { date: "28 dic", visitor: "New York Giants", home: "Detroit Lions" },
  { date: "4 ene", visitor: "Houston Texans", home: "Green Bay Packers" },
];

const emptySquares: Square[] = Array.from({ length: 100 }, (_, index) => ({ id:index + 1, status:"available", participant:"", contact:"", phone:"", reservedByEmail:"", reservedByName:"", reservedAt:"", paidByEmail:"", paidByName:"", paidAt:"" }));
const PASSWORD_PATTERN = "(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,128}";
const PASSWORD_HINT = "Mínimo 8 caracteres con minúscula, mayúscula, número y símbolo especial.";

export default function Home() {
  const [squares, setSquares] = useState<Square[]>(emptySquares);
  const [visitorDigits, setVisitorDigits] = useState("");
  const [homeDigits, setHomeDigits] = useState("");
  const [tab, setTab] = useState<"board" | "games" | "rules" | "reports">("board");
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [selected, setSelected] = useState<Square | null>(null);
  const [showDigits, setShowDigits] = useState(false);
  const [showFlyer, setShowFlyer] = useState(false);
  const [flyerUrl, setFlyerUrl] = useState("");
  const [flyerBlob, setFlyerBlob] = useState<Blob | null>(null);
  const [flyerType, setFlyerType] = useState<FlyerType>("board");
  const [generatingFlyer, setGeneratingFlyer] = useState(false);
  const [refreshingReports, setRefreshingReports] = useState(false);
  const [refreshingBoard, setRefreshingBoard] = useState(false);
  const [me, setMe] = useState<Member | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [gameResults, setGameResults] = useState<GameResult[]>([]);
  const [accessState, setAccessState] = useState<"loading" | "ready" | "signin" | "denied" | "password">("loading");
  const [accessEmail, setAccessEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  async function loadBoard(): Promise<Square[] | null> {
    try {
      const response = await fetch("/api/board", { cache: "no-store" });
      const data = await response.json();
      if (response.status === 401) { setAccessState("signin"); return null; }
      if (response.status === 428 && data.code === "PASSWORD_CHANGE_REQUIRED") { setAccessState("password"); return null; }
      if (response.status === 403) { setAccessEmail(data.email ?? ""); setAccessState("denied"); return null; }
      if (!response.ok) throw new Error(data.error || "No fue posible cargar el tablero");
      setSquares(data.squares); setVisitorDigits(data.settings.visitorDigits ?? ""); setHomeDigits(data.settings.homeDigits ?? "");
      setMe(data.me); setMembers(data.members ?? []); setActivity(data.activity ?? []); setGameResults(data.gameResults ?? []); setAccessState("ready");
      return data.squares as Square[];
    } catch (error) { setNotice(error instanceof Error ? error.message : "No pudimos conectar con el tablero."); return null; }
  }

  useEffect(() => { void loadBoard(); }, []);

  const counts = useMemo(() => ({ available:squares.filter((s) => s.status === "available").length, reserved:squares.filter((s) => s.status === "reserved").length, paid:squares.filter((s) => s.status === "paid").length }), [squares]);
  const report = useMemo(() => buildReportRows(squares), [squares]);

  async function put(payload: Record<string, unknown>) {
    const response = await fetch("/api/board", { method:"PUT", headers:{ "Content-Type":"application/json" }, body:JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo guardar");
    return data;
  }

  async function saveSquare(square: Square) {
    setSaving(true);
    try {
      const data = await put({ action:"square", ...square });
      setSquares((current) => current.map((item) => item.id === data.square.id ? data.square : item)); setSelected(null);
      setNotice(`Casilla ${square.id} actualizada`); await loadBoard();
    } catch (error) { setNotice(error instanceof Error ? error.message : "No se pudo guardar el cambio."); }
    finally { setSaving(false); }
  }

  async function saveDigits() {
    if ((visitorDigits && !isDigitSet(visitorDigits)) || (homeDigits && !isDigitSet(homeDigits))) { setNotice("Usa los dígitos del 0 al 9 una sola vez en cada fila."); return; }
    setSaving(true);
    try { await put({ action:"digits", visitorDigits, homeDigits }); setShowDigits(false); setNotice("Números de juego actualizados"); }
    catch (error) { setNotice(error instanceof Error ? error.message : "No se pudieron guardar los números."); }
    finally { setSaving(false); }
  }

  async function saveGameResult(gameId:number,visitorScore:number,homeScore:number) {
    setSaving(true);
    try { const data=await put({action:"game_result",gameId,visitorScore,homeScore});setGameResults((current)=>[...current.filter((result)=>result.gameId!==gameId),data.gameResult].sort((a,b)=>a.gameId-b.gameId));setNotice(`Resultado del juego ${gameId} actualizado`);await loadBoard();return true; }
    catch(error){setNotice(error instanceof Error?error.message:"No se pudo guardar el resultado.");return false;}
    finally{setSaving(false);}
  }

  async function saveMember(member: Member, originalEmail = "") {
    setSaving(true);
    try {
      const submittedMember = originalEmail && member.approvalStatus === "pending" ? {...member,active:1,approvalStatus:"approved" as const} : member;
      const action = !originalEmail && submittedMember.username ? "member_create_local" : "member";
      const data = await put({ action, ...submittedMember, originalEmail, active:Boolean(submittedMember.active) });
      setMembers(data.members);
      await loadBoard();
      setNotice(`Acceso de ${member.name} actualizado`);
      return true;
    }
    catch (error) { setNotice(error instanceof Error ? error.message : "No se pudo actualizar el acceso."); return false; }
    finally { setSaving(false); }
  }

  async function removeMember(member: Member) {
    setSaving(true);
    try {
      const data = await put({ action:"member_remove", email:member.email });
      setMembers(data.members);
      await loadBoard();
      setNotice(`Acceso de ${member.name} retirado`);
      return true;
    }
    catch (error) { setNotice(error instanceof Error ? error.message : "No se pudo retirar el acceso."); return false; }
    finally { setSaving(false); }
  }

  async function signOut() {
    if (me?.authProvider === "chatgpt") { window.location.href = "/signout-with-chatgpt?return_to=%2F"; return; }
    try { await fetch("/api/auth", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({action:"logout"}) }); }
    finally { window.location.reload(); }
  }

  async function openFlyer(language:"es"|"en"="es") {
    setGeneratingFlyer(true);
    try {
      const latestSquares = await loadBoard();
      if (!latestSquares) return;
      const result = await createFlyer(latestSquares,language);
      setFlyerType(language==="en"?"board-en":"board"); setFlyerUrl(result.url); setFlyerBlob(result.blob); setShowFlyer(true);
    } catch { setNotice("No fue posible generar el flier. Intenta nuevamente."); }
    finally { setGeneratingFlyer(false); }
  }

  async function openReports() {
    setRefreshingReports(true);
    try { if (await loadBoard()) setTab("reports"); }
    finally { setRefreshingReports(false); }
  }

  async function openBoard() {
    setRefreshingBoard(true);
    try { if (await loadBoard()) setTab("board"); }
    finally { setRefreshingBoard(false); }
  }

  async function openReportFlyer() {
    setGeneratingFlyer(true);
    try {
      const latestSquares = await loadBoard();
      if (!latestSquares) return;
      const result = await createReportFlyer(buildReportRows(latestSquares));
      setFlyerType("report"); setFlyerUrl(result.url); setFlyerBlob(result.blob); setShowFlyer(true);
    } catch { setNotice("No fue posible generar el flier de avance. Intenta nuevamente."); }
    finally { setGeneratingFlyer(false); }
  }

  async function openWinnerFlyer(winner:WinnerRow) {
    setGeneratingFlyer(true);
    try {
      const result = await createWinnerFlyer(winner);
      setFlyerType("winner"); setFlyerUrl(result.url); setFlyerBlob(result.blob); setShowFlyer(true);
    } catch { setNotice("No fue posible generar el flier del ganador. Intenta nuevamente."); }
    finally { setGeneratingFlyer(false); }
  }

  async function copyFlyer() {
    if (!flyerBlob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": flyerBlob })]);
      setNotice("Flier copiado. Ya puedes pegarlo en WhatsApp.");
    } catch { downloadFlyer(flyerBlob,flyerType); setNotice("Tu dispositivo no permite copiar imágenes; el flier se descargó."); }
  }

  async function shareFlyer() {
    if (!flyerBlob) return;
    const filename=flyerFilename(flyerType);
    const file = new File([flyerBlob], filename, { type:"image/png" });
    try {
      if (navigator.share && navigator.canShare?.({ files:[file] })) await navigator.share({ title:flyerType==="winner"?"¡Tenemos ganador MNF!":flyerType==="board-en"?"MNF Football Pool 2026":"Quiniela MNF 2026", text:flyerType==="winner"?"¡Felicidades a nuestro ganador! Gracias por participar y apoyar causas que generan un impacto duradero.":flyerType==="report"?"¡Vamos por las 100! Este es nuestro avance de ventas en la Quiniela MNF 2026.":flyerType==="board-en"?"Play for a great cause! Pick your square in the 2026 MNF Football Pool.":"¡Participa por una buena causa! Aparta tu casilla de la Quiniela MNF 2026.", files:[file] });
      else await copyFlyer();
    } catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) setNotice("No fue posible compartir; puedes copiar o descargar el flier."); }
  }

  if (accessState !== "ready") return <AccessScreen state={accessState} email={accessEmail} />;
  const filteredIds = new Set(squares.filter((square) => filter === "all" || square.status === filter).map((square) => square.id));
  const boardLocked = isDigitSet(visitorDigits) && isDigitSet(homeDigits);

  return <main>
    <header className="topbar">
      <img className="club-logo header-logo" src="/logo-crjc-white-gold.png" alt="Rotary Juárez Concordia" />
      <div className="brand-copy"><h1>Quiniela MNF <span>2026</span></h1></div>
      <div className="account-chip"><div><strong>{me?.name}</strong><span>{roleLabel(me?.role ?? "user")}</span></div><button onClick={signOut} aria-label="Cerrar sesión">Salir</button></div>
    </header>

    <section className="hero sports-hero">
      <div className="yard-markers" aria-hidden="true"><span>10</span><span>20</span><span>30</span><span>40</span><span>50</span></div>
      <div className="hero-copy"><span className="eyebrow">Lotería anual pro ayuda · Temporada 2026</span><h2>Un tablero. <em>17 oportunidades</em> de ganar.</h2><p>Cada casilla apoya proyectos de salud, subvenciones humanitarias y el combate contra la polio.</p></div>
      <div className="hero-sports" aria-hidden="true"><div className="football"><span className="laces"><i/><i/><i/><i/></span></div><div className="scoreboard"><span>PREMIO POR JUEGO</span><strong>$300</strong><small>USD · MARCADOR FINAL</small></div></div>
      <div className="goalpost" aria-hidden="true"><i/><b/><span/></div>
    </section>

    <div className="sports-strip" aria-label="Datos principales de la quiniela"><div><span className="mini-football" aria-hidden="true"/><strong>17</strong><small>Juegos MNF</small></div><div><span className="yard-icon" aria-hidden="true">50</span><strong>100</strong><small>Casillas</small></div><div><span className="trophy-icon" aria-hidden="true">★</span><strong>$100</strong><small>Por casilla</small></div><div><span className="heart-icon" aria-hidden="true">♥</span><strong>1</strong><small>Gran causa</small></div></div>

    <nav className="tabs" aria-label="Secciones">
      <button className={tab === "board" ? "active" : ""} onClick={openBoard} disabled={refreshingBoard} aria-busy={refreshingBoard}><span>▦</span> {refreshingBoard ? "Actualizando…" : "Tablero"}</button>
      <button className={tab === "games" ? "active" : ""} onClick={() => setTab("games")}><span>◷</span> Juegos</button>
      <button className={tab === "reports" ? "active" : ""} onClick={openReports} disabled={refreshingReports} aria-busy={refreshingReports}><span>≡</span> {refreshingReports ? "Actualizando…" : "Reportes"}</button>
      <button className={tab === "rules" ? "active" : ""} onClick={() => setTab("rules")}><span>i</span> Reglas</button>
    </nav>

    {notice && <button className="notice" onClick={() => setNotice("")} aria-label="Cerrar aviso">{notice}<span>×</span></button>}

    {tab === "board" && <section className="content board-section">
      <div className="section-heading"><div><p className="kicker">Tablero oficial · 100 casillas</p><h3>Elige tu número de la suerte</h3></div><div className="heading-actions"><button className="flyer-button" onClick={()=>openFlyer("es")} disabled={generatingFlyer}>{generatingFlyer ? "Generando…" : "🏈 Flier español"}</button><button className="flyer-button flyer-button-en" onClick={()=>openFlyer("en")} disabled={generatingFlyer}>{generatingFlyer ? "Generating…" : "🏈 English flyer"}</button>{me?.role === "admin" && <button className="outline-button" onClick={() => setShowDigits(true)}>⚙ Números de juego</button>}</div></div>
      <div className="summary-grid">
        <button className={filter === "available" ? "summary active" : "summary"} onClick={() => setFilter(filter === "available" ? "all" : "available")}><span className="dot available"/><div><strong>{counts.available}</strong><small>Disponibles</small></div></button>
        <button className={filter === "reserved" ? "summary active" : "summary"} onClick={() => setFilter(filter === "reserved" ? "all" : "reserved")}><span className="dot reserved"/><div><strong>{counts.reserved}</strong><small>Reservadas</small></div></button>
        <button className={filter === "paid" ? "summary active" : "summary"} onClick={() => setFilter(filter === "paid" ? "all" : "paid")}><span className="dot paid"/><div><strong>{counts.paid}</strong><small>Pagadas</small></div></button>
        <div className="summary raised"><span className="dot goal">$</span><div><strong>${(counts.reserved + counts.paid) * 100}</strong><small>Comprometidos</small></div></div>
      </div>
      <div className="board-card"><div className="board-meta"><div className="legend"><span><i className="available"/>Disponible</span><span><i className="reserved"/>Reservada</span><span><i className="paid"/>Pagada</span></div><p>{boardLocked ? "Tablero cerrado · números de juego cargados" : "Toca una casilla para ver sus datos"}</p></div>
        <div className="board-scroll"><div className="visitor-label">VISITANTE</div><div className="board-with-axis"><div className="home-label">CASA</div><div className="grid-shell">
          <div className="corner-cell">VS</div>{(visitorDigits || "          ").padEnd(10).slice(0,10).split("").map((digit,index) => <div className="digit top" key={`v-${index}`}>{digit || "?"}</div>)}
          {(homeDigits || "          ").padEnd(10).slice(0,10).split("").map((digit,row) => <div className="row-group" key={`row-${row}`}><div className="digit side">{digit || "?"}</div>{squares.slice(row*10,row*10+10).map((square) => <button key={square.id} className={`square ${square.status} ${filteredIds.has(square.id) ? "" : "dimmed"} ${isOwned(square, me!) ? "mine" : ""}`} onClick={() => setSelected(square)} aria-label={`Casilla ${square.id}, ${labelFor(square.status)}${square.participant ? `, ${square.participant}` : ""}`}><span>{square.id}</span>{square.status !== "available" && <b>{initials(square.participant)}</b>}{isOwned(square, me!) && <i className="mine-badge">Mía</i>}</button>)}</div>)}
        </div></div></div>
      </div>
      <div className="permission-note"><span>{roleIcon(me!.role)}</span><div><strong>Acceso: {roleLabel(me!.role)}</strong><p>{roleHelp(me!.role,boardLocked)}</p></div></div>
      <div className="deadline"><span>!</span><div><strong>Fecha límite de pago</strong><p>Las casillas deben cubrirse en su totalidad antes del 14 de septiembre de 2026.</p></div></div>
    </section>}

    {tab === "games" && <Games />}
    {tab === "rules" && <Rules />}
    {tab === "reports" && <Reports rows={report} squares={squares} visitorDigits={visitorDigits} homeDigits={homeDigits} gameResults={gameResults} activity={activity} me={me!} members={members} saving={saving} generatingFlyer={generatingFlyer} onGenerateFlyer={openReportFlyer} onGenerateWinnerFlyer={openWinnerFlyer} onSaveMember={saveMember} onRemoveMember={removeMember} onSaveGameResult={saveGameResult} />}

    <footer><div className="footer-logo-wrap"><img className="club-logo footer-logo" src="/logo-crjc-white-gold.png" alt="Rotary Juárez Concordia" /></div><p>Genera un impacto duradero</p><span>Actualizado 13 julio 2026</span></footer>

    {selected && <SquareModal square={selected} me={me!} members={members} saving={saving} boardLocked={boardLocked} visitorDigits={visitorDigits} homeDigits={homeDigits} onClose={() => setSelected(null)} onSave={saveSquare} />}
    {showFlyer && flyerUrl && <div className="modal-backdrop flyer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowFlyer(false)}><section className="flyer-modal" role="dialog" aria-modal="true" aria-labelledby="flyer-title"><button className="modal-close" onClick={() => setShowFlyer(false)} aria-label="Cerrar">×</button><div className="flyer-modal-head"><p className="kicker">{flyerType==="board-en"?"Ready to share":"Listo para compartir"}</p><h3 id="flyer-title">{flyerType==="winner"?"Flier del ganador":flyerType==="report"?"Flier de avance":flyerType==="board-en"?"English flyer":"Flier de la quiniela"}</h3><p>{flyerType==="winner"?"Celebra y comparte al ganador de esta fecha.":flyerType==="report"?"El reporte refleja el avance más reciente por socio.":flyerType==="board-en"?"The image shows the latest board status and rules in English.":"La imagen refleja el estado actual del tablero."}</p></div><div className="flyer-preview"><img src={flyerUrl} alt={flyerType==="winner"?"Flier de felicitación al ganador de la Quiniela MNF":flyerType==="report"?"Flier del avance de casillas por socio":flyerType==="board-en"?"English MNF Football Pool flyer with board and rules":"Flier vertical de la Quiniela MNF 2026 con tablero y reglas"}/></div><div className="flyer-actions"><button className="whatsapp-button" onClick={shareFlyer}>Compartir</button><button className="copy-button" onClick={copyFlyer}>Copiar imagen</button><button className="download-button" onClick={() => flyerBlob && downloadFlyer(flyerBlob,flyerType)}>Guardar PNG</button></div></section></div>}
    {showDigits && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowDigits(false)}><section className="modal digits-modal" role="dialog" aria-modal="true" aria-labelledby="digits-title"><button className="modal-close" onClick={() => setShowDigits(false)} aria-label="Cerrar">×</button><p className="kicker">Inicio de temporada</p><h3 id="digits-title">Números de juego</h3><p className="modal-help">Déjalos vacíos hasta el sorteo. Después, ingresa los 10 dígitos en el orden asignado.</p><label>Columnas — visitante<input value={visitorDigits} onChange={(e) => setVisitorDigits(cleanDigits(e.target.value))} inputMode="numeric" maxLength={10} placeholder="Ej. 7451029863" /></label><label>Renglones — casa<input value={homeDigits} onChange={(e) => setHomeDigits(cleanDigits(e.target.value))} inputMode="numeric" maxLength={10} placeholder="Ej. 0294831756" /></label><div className="modal-actions"><button className="secondary" onClick={() => {setVisitorDigits("");setHomeDigits("");}}>Limpiar</button><button className="primary" onClick={saveDigits} disabled={saving}>{saving ? "Guardando…" : "Guardar números"}</button></div></section></div>}
  </main>;
}

function AccessScreen({ state, email }:{ state:"loading"|"signin"|"denied"|"password"; email:string }) {
  const [mode,setMode] = useState<"login"|"register"|"change">(state==="password"?"change":"login");
  const [name,setName] = useState("");
  const [username,setUsername] = useState("");
  const [password,setPassword] = useState("");
  const [confirmPassword,setConfirmPassword] = useState("");
  const [message,setMessage] = useState("");
  const [submitting,setSubmitting] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setMessage("");
    if ((mode === "register" || mode === "change") && password !== confirmPassword) { setMessage("Las contraseñas no coinciden"); return; }
    if ((mode === "register" || mode === "change") && !passwordMeetsPolicy(password)) { setMessage(PASSWORD_HINT); return; }
    setSubmitting(true);
    try {
      const action = mode === "change" ? "change_password" : mode;
      const response = await fetch("/api/auth", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ action, name, username, password }) });
      const responseText = await response.text();
      const data = responseText ? JSON.parse(responseText) : {};
      if (!response.ok) throw new Error(data.error || "No fue posible continuar");
      if (mode === "login" && data.mustChangePassword) { setMode("change"); setPassword(""); setConfirmPassword(""); setMessage("Por seguridad, reemplaza la contraseña temporal."); }
      else if (mode === "login" || mode === "change") window.location.reload();
      else { setMessage(data.message); setPassword(""); setConfirmPassword(""); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "No fue posible continuar"); }
    finally { setSubmitting(false); }
  }
  if (state === "loading") return <main className="access-screen"><div className="access-card loading-card"><img src="/logo-crjc.png" alt="Rotary Juárez Concordia"/><p className="kicker">Quiniela MNF 2026</p><h1>Preparando tu tablero</h1><div className="access-loader"/></div></main>;
  return <main className="access-screen"><div className="access-card auth-card"><img src="/logo-crjc.png" alt="Rotary Juárez Concordia"/><p className="kicker">Quiniela MNF 2026</p><h1>{mode === "login" ? "Bienvenido al juego" : mode === "register" ? "Solicita tu acceso" : "Crea tu contraseña"}</h1><p>{mode === "login" ? "Entra con el usuario y contraseña registrados para tu cuenta." : mode === "register" ? "Crea tus datos de acceso. Un administrador deberá aprobar tu solicitud antes de que puedas entrar." : "La contraseña temporal solo funciona para el primer ingreso. Elige una contraseña personal para continuar."}</p>
    {mode !== "change" && <div className="auth-switch"><button className={mode==="login"?"active":""} onClick={()=>{setMode("login");setMessage("");}}>Iniciar sesión</button><button className={mode==="register"?"active":""} onClick={()=>{setMode("register");setMessage("");}}>Solicitar acceso</button></div>}
    <form className="auth-form" onSubmit={submit}>{mode === "register" && <label>Nombre completo<input value={name} onChange={(event)=>setName(event.target.value)} autoComplete="name" required minLength={3} maxLength={80} placeholder="Nombre del socio"/></label>}{mode !== "change" && <label>Usuario<input value={username} onChange={(event)=>setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9._-]/g,""))} autoComplete="username" required minLength={4} maxLength={30} placeholder="Ej. marioblanco"/></label>}<label>{mode === "change" ? "Nueva contraseña" : "Contraseña"}<input value={password} onChange={(event)=>setPassword(event.target.value)} type="password" autoComplete={mode==="login"?"current-password":"new-password"} required minLength={8} maxLength={128} pattern={mode==="login"?undefined:PASSWORD_PATTERN} title={mode==="login"?undefined:PASSWORD_HINT} placeholder={mode==="login"?"Contraseña":"Contraseña segura"}/></label>{(mode === "register" || mode === "change") && <><small className="password-hint">{PASSWORD_HINT}</small><label>Confirmar contraseña<input value={confirmPassword} onChange={(event)=>setConfirmPassword(event.target.value)} type="password" autoComplete="new-password" required minLength={8} maxLength={128} pattern={PASSWORD_PATTERN} title={PASSWORD_HINT}/></label></>}<button className="access-button" disabled={submitting}>{submitting?"Procesando…":mode==="login"?"Entrar al tablero":mode==="register"?"Enviar solicitud":"Guardar contraseña y entrar"}</button></form>
    {message && <p className="auth-message" role="status">{message}</p>}{state === "denied" && <p className="legacy-warning">La cuenta anterior {email && <strong>{email}</strong>} no tiene acceso. Puedes usar una cuenta propia o solicitarla aquí.</p>}
    {mode !== "change" && <div className="legacy-access"><span>Transición administrativa</span><a href="/signin-with-chatgpt?return_to=%2F">Entrar con el acceso anterior de ChatGPT</a></div>}
  </div></main>;
}

function SquareModal({ square, me, members, saving, boardLocked, visitorDigits, homeDigits, onClose, onSave }:{ square:Square; me:Member; members:Member[]; saving:boolean; boardLocked:boolean; visitorDigits:string; homeDigits:string; onClose:()=>void; onSave:(square:Square)=>void }) {
  const [draft,setDraft] = useState(square);
  const owns = isOwned(square,me); const admin = me.role === "admin"; const treasuryPayment = me.role === "treasury" && square.status === "reserved"; const treasuryOther = treasuryPayment && !owns;
  const column=(square.id-1)%10,row=Math.floor((square.id-1)/10),gameNumbersReady=isDigitSet(visitorDigits)&&isDigitSet(homeDigits),visitorDigit=visitorDigits[column],homeDigit=homeDigits[row];
  const editableDetails = admin || (!boardLocked && (owns || square.status === "available"));
  const statuses = (["available","reserved","paid"] as Status[]);
  const allowed = (status:Status) => admin || (boardLocked ? treasuryPayment && status === "paid" : (square.status === "available" && status === "reserved") || (owns && square.status === "reserved" && (status === "reserved" || (me.role === "treasury" && status === "paid"))) || (owns && square.status === "paid" && status === "paid") || (treasuryOther && status === "paid"));
  const canSave = admin || allowed(draft.status);
  function update(field:keyof Square,value:string){ setDraft((current) => ({...current,[field]:value})); }
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="square-title"><button className="modal-close" onClick={onClose} aria-label="Cerrar">×</button><div className={`modal-number ${draft.status}`}>{draft.id}</div><div><p className="kicker">Detalle de casilla</p><h3 id="square-title">Casilla #{draft.id}</h3></div>
    <div className="status-picker" role="group" aria-label="Estado de la casilla">{statuses.map((status) => <button key={status} disabled={!allowed(status)} className={draft.status === status ? `active ${status}` : status} onClick={() => setDraft((current) => ({...current,status}))}><i/>{labelFor(status)}</button>)}</div>
    <div className={`square-matchup ${gameNumbersReady?"":"pending"}`}><span>Números de juego</span>{gameNumbersReady?<strong><b>Visitante {visitorDigit}</b><i>VS</i><b>Casa {homeDigit}</b></strong>:<strong>Pendientes de asignación</strong>}</div>
    {draft.status !== "available" && <>{editableDetails ? <><label>Nombre de quien juega<input autoFocus value={draft.participant} onChange={(e) => update("participant",e.target.value)} placeholder="Nombre completo"/></label><label>Teléfono <span>(opcional)</span><input value={draft.phone} onChange={(e) => update("phone",e.target.value)} inputMode="tel" placeholder="(656) 000 0000"/></label></> : <div className="readonly-data"><small>JUGADOR</small><strong>{draft.participant}</strong>{draft.phone && <span>{draft.phone}</span>}</div>}
      {admin ? <label>Socio que la vendió<select value={draft.reservedByName} onChange={(e) => { const member = members.find((item) => item.name === e.target.value); setDraft((current) => ({...current,reservedByName:e.target.value,reservedByEmail:member?.email ?? current.reservedByEmail})); }}><option value="">Selecciona un socio registrado</option>{draft.reservedByName && !members.some((member) => member.name === draft.reservedByName) && <option value={draft.reservedByName}>{draft.reservedByName} (registro anterior)</option>}{members.filter((member) => member.active).map((member) => <option key={member.email} value={member.name}>{member.name}</option>)}</select></label> : <div className="ownership"><span>Vendida por</span><strong>{draft.reservedByName || (square.status === "available" ? me.name : "Sin asignar")}</strong></div>}
      {draft.status === "paid" && <div className="payment-proof"><span>Pago confirmado por</span><strong>{draft.paidByName || "Se registrará al guardar"}</strong></div>}
    </>}
    {!canSave && boardLocked && <p className="locked-message">Los números de juego ya fueron cargados. El tablero está cerrado para nuevas reservas y ediciones.</p>}
    {!canSave && !boardLocked && square.status === "available" && <p className="modal-help">Esta casilla está disponible. Selecciona <strong>Reservada</strong> para capturar los datos y apartarla.</p>}
    {!canSave && !boardLocked && square.status !== "available" && <p className="locked-message">Esta casilla fue vendida por otro socio. Puedes consultar sus datos, pero no modificarlos.</p>}
    <div className="modal-actions"><button className="secondary" onClick={onClose}>Cerrar</button>{canSave && <button className="primary" disabled={saving || (draft.status !== "available" && (!draft.participant.trim() || (admin && !draft.reservedByName.trim())))} onClick={() => onSave(draft)}>{saving ? "Guardando…" : treasuryPayment && draft.status === "paid" ? "Confirmar pago" : "Guardar cambios"}</button>}</div>
  </section></div>;
}

function Reports({ rows, squares, visitorDigits, homeDigits, gameResults, activity, me, members, saving, generatingFlyer, onGenerateFlyer, onGenerateWinnerFlyer, onSaveMember, onRemoveMember, onSaveGameResult }:{ rows:ReportRow[]; squares:Square[]; visitorDigits:string; homeDigits:string; gameResults:GameResult[]; activity:Activity[]; me:Member; members:Member[]; saving:boolean; generatingFlyer:boolean; onGenerateFlyer:()=>void; onGenerateWinnerFlyer:(winner:WinnerRow)=>Promise<void>; onSaveMember:(member:Member,originalEmail?:string)=>Promise<boolean>; onRemoveMember:(member:Member)=>Promise<boolean>; onSaveGameResult:(gameId:number,visitorScore:number,homeScore:number)=>Promise<boolean> }) {
  const [reportView,setReportView] = useState<"summary"|"squares"|"winners"|"activity"|"access">("summary");
  const [draft,setDraft] = useState<Member>({email:"",name:"",username:"",tempPassword:"",role:"user",active:1,approvalStatus:"approved"});
  const [editingEmail,setEditingEmail] = useState("");
  const [detailName,setDetailName] = useState("");
  const [detailSort,setDetailSort] = useState<{key:"square"|"visitor";direction:"asc"|"desc"}>({key:"square",direction:"asc"});
  const [squareFilter,setSquareFilter] = useState("all");
  const [squareSort,setSquareSort] = useState<{key:SquareReportSortKey;direction:"asc"|"desc"}>({key:"square",direction:"asc"});
  const [resultGameId,setResultGameId] = useState(1);
  const [visitorScore,setVisitorScore] = useState("");
  const [homeScore,setHomeScore] = useState("");
  useEffect(()=>{const existing=gameResults.find((result)=>result.gameId===resultGameId);setVisitorScore(existing?String(existing.visitorScore):"");setHomeScore(existing?String(existing.homeScore):"");},[resultGameId,gameResults]);
  useEffect(()=>{if(me.role!=="admin"&&(reportView==="activity"||reportView==="access"))setReportView("summary");},[me.role,reportView]);
  const resetMemberForm = () => { setDraft({email:"",name:"",username:"",tempPassword:"",role:"user",active:1,approvalStatus:"approved"}); setEditingEmail(""); };
  const pendingCount = members.filter((member)=>member.approvalStatus==="pending").length;
  const totals = { reserved:rows.reduce((n,row)=>n+row.reserved,0), paid:rows.reduce((n,row)=>n+row.paid,0), total:rows.reduce((n,row)=>n+row.total,0) };
  const gameNumbersReady=isDigitSet(visitorDigits)&&isDigitSet(homeDigits);
  const detailSquares=squares.filter((square)=>square.status!=="available"&&(square.reservedByName||square.contact||"Sin asignar")===detailName).sort((a,b)=>{const factor=detailSort.direction==="asc"?1:-1;if(detailSort.key==="square")return factor*(a.id-b.id);const av=gameNumbersReady?Number(visitorDigits[(a.id-1)%10]):-1,bv=gameNumbersReady?Number(visitorDigits[(b.id-1)%10]):-1;return factor*((av-bv)||(a.id-b.id));});
  const toggleDetailSort=(key:"square"|"visitor")=>setDetailSort((current)=>({key,direction:current.key===key&&current.direction==="asc"?"desc":"asc"}));
  const squareSeller=(square:Square)=>square.status==="available"?"":square.reservedByName||square.contact||"Sin asignar";
  const squareSortValue=(square:Square,key:SquareReportSortKey):string|number=>key==="square"?square.id:key==="visitor"?(gameNumbersReady?Number(visitorDigits[(square.id-1)%10]):-1):key==="home"?(gameNumbersReady?Number(homeDigits[Math.floor((square.id-1)/10)]):-1):key==="player"?square.participant:key==="seller"?squareSeller(square):labelFor(square.status);
  const squareReportRows=squares.filter((square)=>square.status!=="available"&&(squareFilter==="all"||squareSeller(square)===squareFilter)).sort((a,b)=>{const av=squareSortValue(a,squareSort.key),bv=squareSortValue(b,squareSort.key),comparison=typeof av==="number"&&typeof bv==="number"?av-bv:String(av).localeCompare(String(bv),"es",{sensitivity:"base"});return (squareSort.direction==="asc"?1:-1)*(comparison||(a.id-b.id));});
  const toggleSquareSort=(key:SquareReportSortKey)=>setSquareSort((current)=>({key,direction:current.key===key&&current.direction==="asc"?"desc":"asc"}));
  const squareSortIcon=(key:SquareReportSortKey)=>squareSort.key===key?(squareSort.direction==="asc"?"▲":"▼"):"↕";
  const winnerFromResult=(result:GameResult):WinnerRow|undefined=>{if(!gameNumbersReady)return;const visitorDigit=result.visitorScore%10,homeDigit=result.homeScore%10,column=visitorDigits.indexOf(String(visitorDigit)),row=homeDigits.indexOf(String(homeDigit)),square=column>=0&&row>=0?squares[row*10+column]:undefined,game=games[result.gameId-1];return square&&game?{result,game,square,visitorDigit,homeDigit}:undefined;};
  const winnerRows=gameResults.map(winnerFromResult).filter((winner):winner is WinnerRow=>Boolean(winner));
  const selectedResultGame=games[resultGameId-1];
  return <section className="content reports-section"><div className="section-heading"><div><p className="kicker">Control y seguimiento</p><h3>Reportes</h3></div><span className="year-pill">{squares.filter((s)=>s.status!=="available").length} vendidas</span></div>
    <div className="report-switch"><button className={reportView==="summary"?"active":""} onClick={()=>setReportView("summary")}>Sumario por socio</button><button className={reportView==="squares"?"active":""} onClick={()=>setReportView("squares")}>Detalle de casillas</button><button className={reportView==="winners"?"active":""} onClick={()=>setReportView("winners")}>Ganadores</button>{me.role==="admin"&&<><button className={reportView==="activity"?"active":""} onClick={()=>setReportView("activity")}>Actividad</button><button className={reportView==="access"?"active":""} onClick={()=>setReportView("access")}>Accesos{pendingCount>0&&<b className="pending-count">{pendingCount}</b>}</button></>}</div>
    {reportView === "summary" && <div className="report-card"><div className="report-card-head"><div><h4>Casillas reservadas y pagadas por socio</h4><p>Selecciona el nombre de un socio para consultar el detalle de sus casillas.</p></div><div className="report-head-actions">{me.role==="admin"&&<button className="report-flyer-button" onClick={onGenerateFlyer} disabled={generatingFlyer}>{generatingFlyer?"Generando…":"🏈 Flier de avance"}</button>}<div className="report-value"><strong>${totals.paid*100}</strong><span>cobrado</span></div></div></div><div className="report-table-wrap"><table className="report-table"><thead><tr><th>Socio</th><th>Reservada</th><th>Pagada</th><th>Total</th></tr></thead><tbody>{rows.map((row)=><tr key={row.name}><td><button className="report-member-link" onClick={()=>{setDetailName(row.name);setDetailSort({key:"square",direction:"asc"});}}>{row.name}</button></td><td>{row.reserved || ""}</td><td>{row.paid || ""}</td><td><strong>{row.total}</strong></td></tr>)}</tbody><tfoot><tr><td>Total general</td><td>{totals.reserved}</td><td>{totals.paid}</td><td>{totals.total}</td></tr></tfoot></table></div></div>}
    {reportView === "squares" && <div className="report-card all-squares-card"><div className="report-card-head"><div><h4>Detalle de casillas reservadas y pagadas</h4><p>{squareReportRows.length} registros mostrados · selecciona cualquier encabezado para ordenar.</p></div><label className="square-report-filter">Socio<select value={squareFilter} onChange={(event)=>setSquareFilter(event.target.value)}><option value="all">Todos los socios</option>{rows.map((row)=><option key={row.name} value={row.name}>{row.name}</option>)}</select></label></div><div className="all-squares-wrap"><table className="all-squares-table"><thead><tr>{([['square','Casilla'],['visitor','Visitante'],['home','Casa'],['player','Jugador'],['seller','Socio'],['status','Estado']] as [SquareReportSortKey,string][]).map(([key,label])=><th key={key} aria-sort={squareSort.key===key?(squareSort.direction==="asc"?"ascending":"descending"):"none"}><button onClick={()=>toggleSquareSort(key)}>{label}<span>{squareSortIcon(key)}</span></button></th>)}</tr></thead><tbody>{squareReportRows.map((square)=>{const visitor=gameNumbersReady?visitorDigits[(square.id-1)%10]:"—",home=gameNumbersReady?homeDigits[Math.floor((square.id-1)/10)]:"—",seller=squareSeller(square);return <tr key={square.id}><td><strong>#{square.id}</strong></td><td>{visitor}</td><td>{home}</td><td>{square.participant||"—"}</td><td>{seller||"—"}</td><td><span className={`drilldown-status ${square.status}`}>{labelFor(square.status)}</span></td></tr>;})}</tbody></table></div></div>}
    {reportView === "winners" && <div className="winners-view">{me.role==="admin"&&<form className="report-card result-entry" onSubmit={async(event)=>{event.preventDefault();const result={gameId:resultGameId,visitorScore:Number(visitorScore),homeScore:Number(homeScore)};if(await onSaveGameResult(result.gameId,result.visitorScore,result.homeScore)){const winner=winnerFromResult(result);if(winner)await onGenerateWinnerFlyer(winner);}}}><div><p className="kicker">Captura administrativa</p><h4>Registrar resultado final</h4><p>Incluye el marcador después de tiempos extras. Al guardar, se generará el flier del ganador.</p></div><label>Juego<select value={resultGameId} onChange={(event)=>setResultGameId(Number(event.target.value))}>{games.map((game,index)=><option key={index+1} value={index+1}>{String(index+1).padStart(2,"0")} · {gameDateLabel(index+1)} · {game.visitor} vs {game.home}</option>)}</select></label><div className="score-entry"><label><span className="score-team">{selectedResultGame?.visitor||"Visitante"}</span><input aria-label={`Marcador final de ${selectedResultGame?.visitor||"visitante"}`} type="number" min="0" max="999" inputMode="numeric" placeholder="0" required value={visitorScore} onChange={(event)=>setVisitorScore(event.target.value)}/></label><span className="score-vs">VS</span><label><span className="score-team">{selectedResultGame?.home||"Casa"}</span><input aria-label={`Marcador final de ${selectedResultGame?.home||"casa"}`} type="number" min="0" max="999" inputMode="numeric" placeholder="0" required value={homeScore} onChange={(event)=>setHomeScore(event.target.value)}/></label></div><button className="primary" disabled={saving||generatingFlyer||visitorScore===""||homeScore===""}>{saving?"Guardando…":generatingFlyer?"Generando…":"Guardar y generar flier"}</button></form>}<div className="report-card winners-card"><div className="report-card-head"><div><h4>Casillas ganadoras</h4><p>Se utiliza la unidad del marcador final de visitante y casa, incluidos tiempos extras.</p></div><span className="winner-count">{winnerRows.length} de 17</span></div>{!gameNumbersReady&&gameResults.length>0?<p className="empty-report">Carga los números de juego para poder determinar las casillas ganadoras.</p>:winnerRows.length===0?<p className="empty-report">Los ganadores aparecerán al registrar los resultados finales.</p>:<div className="winners-table-wrap"><table className="winners-table"><thead><tr><th>Fecha del juego</th><th>Casilla</th><th>Estado</th><th>Jugador</th><th>Resultado del juego</th><th>Visitante</th><th>Casa</th><th>Socio</th>{me.role==="admin"&&<th>Flier</th>}</tr></thead><tbody>{winnerRows.map((winner)=><tr key={winner.result.gameId}><td>{gameDateLabel(winner.result.gameId)}</td><td><strong>#{winner.square.id}</strong></td><td><span className={`drilldown-status ${winner.square.status}`}>{labelFor(winner.square.status)}</span></td><td>{winner.square.participant||"—"}</td><td><span className="final-score"><b>{winner.game.visitor} {winner.result.visitorScore}</b><i>vs</i><b>{winner.game.home} {winner.result.homeScore}</b></span></td><td>{winner.visitorDigit}</td><td>{winner.homeDigit}</td><td>{winner.square.reservedByName||winner.square.contact||"—"}</td>{me.role==="admin"&&<td><button className="winner-flyer-button" disabled={generatingFlyer} onClick={()=>onGenerateWinnerFlyer(winner)}>Generar</button></td>}</tr>)}</tbody></table></div>}</div></div>}
    {me.role === "admin" && reportView === "activity" && <div className="report-card"><div className="report-card-head"><div><h4>Actividad reciente</h4><p>Quién reservó, cobró o modificó cada casilla.</p></div></div><div className="activity-list">{activity.length ? activity.map((item)=><article key={item.id}><span className={`activity-icon ${item.action}`}>{activityIcon(item.action)}</span><div><strong>{item.actorName}</strong><p>{activityText(item)}</p><small>{formatDate(item.createdAt)} · {roleLabel(item.actorRole)}</small></div>{item.squareId&&<b>#{item.squareId}</b>}</article>) : <p className="empty-report">La actividad nueva aparecerá aquí.</p>}</div></div>}
    {reportView === "access" && <div className="access-management"><div className="member-form report-card"><div className="report-card-head"><div><h4>{editingEmail ? "Editar acceso" : "Crear cuenta propia"}</h4><p>{draft.approvalStatus==="pending"?"Revisa la solicitud, asigna el nivel y aprueba al nuevo usuario.":editingEmail?"Actualiza el nivel, estado o asigna una nueva contraseña temporal.":"Crea el usuario y comparte la contraseña temporal de forma privada."}</p></div>{editingEmail && <button className="form-cancel" onClick={resetMemberForm}>Cancelar</button>}</div><div className="member-form-grid">
      <label>Nombre<input value={draft.name} onChange={(e)=>setDraft({...draft,name:e.target.value})} placeholder="Nombre del socio"/></label>
      {!editingEmail || draft.username ? <label>Usuario<input value={draft.username??""} readOnly={Boolean(editingEmail)} onChange={(e)=>setDraft({...draft,username:e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g,"")})} placeholder="Ej. marioblanco"/></label> : <label>Correo de acceso anterior<input value={draft.email} onChange={(e)=>setDraft({...draft,email:e.target.value})} type="email" placeholder="socio@correo.com"/></label>}
      {(!editingEmail || draft.username) && <label>{editingEmail?"Nueva contraseña temporal (opcional)":"Contraseña temporal"}<input value={draft.tempPassword??""} onChange={(e)=>setDraft({...draft,tempPassword:e.target.value})} type="password" autoComplete="new-password" minLength={8} maxLength={128} pattern={PASSWORD_PATTERN} title={PASSWORD_HINT} placeholder="Contraseña segura"/><small className="password-hint">{PASSWORD_HINT}</small></label>}
      <label>Nivel<select value={draft.role} onChange={(e)=>setDraft({...draft,role:e.target.value as Role})}><option value="user">Usuario</option><option value="treasury">Tesorería</option><option value="admin">Administrador</option></select></label>
      <label>Estado<select value={draft.approvalStatus??(draft.active?"approved":"suspended")} onChange={(e)=>{const status=e.target.value as "pending"|"approved"|"suspended";setDraft({...draft,approvalStatus:status,active:status==="approved"?1:0});}}><option value="pending" disabled={!editingEmail}>Pendiente</option><option value="approved">Activo</option><option value="suspended">Suspendido</option></select></label>
    </div><button className="primary member-save" disabled={saving||!draft.name||(!editingEmail&&(!draft.username||!passwordMeetsPolicy(draft.tempPassword??"")))||(Boolean(editingEmail)&&!draft.username&&!draft.email)} onClick={async()=>{if(await onSaveMember(draft,editingEmail))resetMemberForm();}}>{saving?"Guardando…":draft.approvalStatus==="pending"?"Aprobar y guardar":editingEmail?"Guardar cambios":"Crear cuenta propia"}</button></div>
      <div className="report-card member-list"><div className="report-card-head"><div><h4>Usuarios y solicitudes</h4><p>{members.filter((member)=>member.active).length} activos · {pendingCount} pendientes</p></div></div>{members.map((member)=>{const pending=member.approvalStatus==="pending";return <article className={pending?"member-pending":""} key={member.email}><div><strong>{member.name}</strong><span>{member.username?`@${member.username}`:member.email}</span></div><span className={pending?"member-awaiting":member.active?"member-active":"member-inactive"}>{pending?"Pendiente":member.active?roleLabel(member.role):"Suspendido"}</span><div className="member-actions">{pending&&<button className="member-approve" disabled={saving} onClick={()=>onSaveMember({...member,active:1,approvalStatus:"approved"},member.email)}>Aprobar</button>}<button className="member-edit" onClick={()=>{setDraft({...member});setEditingEmail(member.email);}}>Editar</button><button className="member-remove" disabled={member.email===me.email||saving} onClick={async()=>{if(window.confirm(`${pending?"¿Rechazar la solicitud":"¿Retirar el acceso"} de ${member.name}?`)&&await onRemoveMember(member)){if(editingEmail===member.email)resetMemberForm();}}}>{pending?"Rechazar":"Retirar"}</button></div></article>})}</div>
    </div>}
    {detailName && <div className="modal-backdrop" role="presentation" onMouseDown={(event)=>event.target===event.currentTarget&&setDetailName("")}><section className="modal drilldown-modal" role="dialog" aria-modal="true" aria-labelledby="drilldown-title"><button className="modal-close" onClick={()=>setDetailName("")} aria-label="Cerrar">×</button><p className="kicker">Detalle por socio</p><h3 id="drilldown-title">{detailName}</h3><p className="drilldown-summary">{detailSquares.length} casillas · {detailSquares.filter((square)=>square.status==="reserved").length} reservadas · {detailSquares.filter((square)=>square.status==="paid").length} pagadas</p><div className="drilldown-table-wrap"><table className="drilldown-table"><thead><tr><th aria-sort={detailSort.key==="square"?(detailSort.direction==="asc"?"ascending":"descending"):"none"}><button onClick={()=>toggleDetailSort("square")}>Casilla <span>{detailSort.key==="square"?(detailSort.direction==="asc"?"▲":"▼"):"↕"}</span></button></th><th>Estado</th><th>Jugador</th><th aria-sort={detailSort.key==="visitor"?(detailSort.direction==="asc"?"ascending":"descending"):"none"}><button onClick={()=>toggleDetailSort("visitor")}>Visitante <span>{detailSort.key==="visitor"?(detailSort.direction==="asc"?"▲":"▼"):"↕"}</span></button></th><th>Casa</th></tr></thead><tbody>{detailSquares.map((square)=>{const visitor=gameNumbersReady?visitorDigits[(square.id-1)%10]:"—",home=gameNumbersReady?homeDigits[Math.floor((square.id-1)/10)]:"—";return <tr key={square.id}><td><strong>#{square.id}</strong></td><td><span className={`drilldown-status ${square.status}`}>{labelFor(square.status)}</span></td><td>{square.participant||"—"}</td><td>{visitor}</td><td>{home}</td></tr>;})}</tbody></table></div></section></div>}
  </section>;
}

function Games(){ return <section className="content games-section"><div className="section-heading"><div><p className="kicker">Calendario oficial</p><h3>17 lunes de emoción</h3></div><span className="year-pill">2026–27</span></div><div className="games-list">{games.map((game,index)=><article className="game" key={`${game.date}-${game.visitor}`}><div className="game-number"><span>JUEGO</span><strong>{String(index+1).padStart(2,"0")}</strong></div><div className="game-date">{game.date}</div><div className="matchup"><div><small>VISITANTE</small><strong>{game.visitor}</strong></div><span>@</span><div><small>CASA</small><strong>{game.home}</strong></div></div><div className="monday">LUN<br/>7:00</div></article>)}</div></section>; }

function Rules(){ const rules=[["$100 USD por casilla","El apoyo debe cubrirse totalmente antes del 14 de septiembre de 2026."],["$300 USD por juego","Puedes ganar cada vez que tu marcador resulte premiado durante los 17 juegos."],["Los números se revelan al inicio","Las casillas se eligen al azar. Los dígitos permanecen ocultos hasta iniciar la temporada."],["Cuenta el marcador final","Se consideran tiempos extras y solamente la unidad del resultado de cada equipo."]]; return <section className="content rules-section"><div className="section-heading"><div><p className="kicker">Cómo se juega</p><h3>Reglas claras, diversión grande</h3></div></div><div className="rules-grid">{rules.map(([title,body],index)=><article key={title}><span>{index+1}</span><div><h4>{title}</h4><p>{body}</p></div></article>)}</div><div className="example"><span className="example-tag">EJEMPLO</span><h4>Visitante 17 — Casa 10</h4><p>Gana la casilla donde la columna <strong>7</strong> cruza con el renglón <strong>0</strong>.</p><div className="score-example"><div><small>VISITANTE</small><strong>17</strong></div><span>→</span><div className="winning-square"><small>CASILLA</small><strong>7 × 0</strong></div><span>←</span><div><small>CASA</small><strong>10</strong></div></div></div><div className="warnings"><p>Las casillas no pagadas totalmente no juegan.</p><p>Si gana una casilla no vendida, el premio se queda en el club.</p><p>Solo participan los juegos aquí listados.</p></div></section>; }

function buildReportRows(squares:Square[]):ReportRow[]{
  const rows=new Map<string,ReportRow>();
  squares.filter((square)=>square.status!=="available").forEach((square)=>{const name=square.reservedByName||square.contact||"Sin asignar";const row=rows.get(name)??{name,reserved:0,paid:0,total:0};if(square.status==="reserved")row.reserved+=1;else row.paid+=1;row.total+=1;rows.set(name,row);});
  return [...rows.values()].sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name));
}

async function createWinnerFlyer({result,game,square,visitorDigit,homeDigit}:WinnerRow){
  const canvas=document.createElement("canvas");canvas.width=1080;canvas.height=1920;
  const ctx=canvas.getContext("2d");if(!ctx)throw new Error("Canvas no disponible");
  const styles=getComputedStyle(document.body),displayFont=styles.getPropertyValue("--font-display").trim()||"Arial Black",sportFont=styles.getPropertyValue("--font-sport").trim()||"Impact",bodyFont=styles.getPropertyValue("--font-body").trim()||"Arial";
  await document.fonts.ready;await document.fonts.load(`400 78px ${sportFont}`);
  const navy="#061b3e",dark="#020918",gold="#f7b500",cream="#fff8e5",white="#ffffff",red="#d7193f";
  const [stadium,clubLogo,mnfLogo,motto]=await Promise.all([loadCanvasImage("/flyer-stadium-bg.png"),loadCanvasImage("/logo-crjc-white-gold.png"),loadCanvasImage("/logo-monday-night-football.png"),loadCanvasImage("/lema-rotario-2026-2027.png")]);
  ctx.drawImage(stadium,0,0,1080,1920);const shade=ctx.createLinearGradient(0,0,0,1920);shade.addColorStop(0,"#020817d2");shade.addColorStop(.42,"#061b3eb0");shade.addColorStop(1,"#020918dc");ctx.fillStyle=shade;ctx.fillRect(0,0,1080,1920);
  ctx.save();ctx.globalAlpha=.27;ctx.strokeStyle=white;ctx.fillStyle=white;ctx.textAlign="center";const fieldTop=305,fieldBottom=1755,topHalf=270,bottomHalf=535;[-1,1].forEach((side)=>{ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(540+side*topHalf,fieldTop);ctx.lineTo(540+side*bottomHalf,fieldBottom);ctx.stroke();});for(let line=0;line<=10;line++){const fraction=line/10,perspective=Math.pow(fraction,1.42),y=fieldTop+(fieldBottom-fieldTop)*perspective,half=topHalf+(bottomHalf-topHalf)*perspective,left=540-half,right=540+half;ctx.lineWidth=line===5?5:2.5;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();const tick=7+17*perspective;[-.32,.32].forEach((position)=>{const x=540+half*position;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x,y-tick);ctx.lineTo(x,y+tick);ctx.stroke();});[-.78,.78].forEach((position)=>{const x=540+half*position;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y-tick*.65);ctx.lineTo(x,y+tick*.65);ctx.stroke();});if(line>0&&line<10&&line%2===0){const yard=line<=5?line*10:(10-line)*10;ctx.font=`400 ${Math.round(17+23*perspective)}px ${sportFont}`;ctx.fillText(String(yard),left+half*.2,y-11);ctx.fillText(String(yard),right-half*.2,y-11);}}ctx.restore();
  ctx.save();const glow=ctx.createRadialGradient(540,85,10,540,85,470);glow.addColorStop(0,"#ffffff42");glow.addColorStop(.25,"#f7b50015");glow.addColorStop(1,"#ffffff00");ctx.fillStyle=glow;ctx.fillRect(0,0,1080,620);ctx.restore();ctx.fillStyle=gold;ctx.fillRect(0,0,1080,14);ctx.fillRect(0,1906,1080,14);
  const clubW=472,clubH=clubW*(clubLogo.height/clubLogo.width);ctx.drawImage(clubLogo,38,20,clubW,clubH);const mnfW=205,mnfH=mnfW*(mnfLogo.height/mnfLogo.width);ctx.drawImage(mnfLogo,817,25,mnfW,mnfH);
  ctx.textAlign="center";ctx.fillStyle=gold;ctx.font=`400 28px ${sportFont}`;ctx.fillText("QUINIELA MNF 2026",540,276);ctx.fillStyle=white;canvasFontToFit(ctx,"¡TENEMOS GANADOR!",940,78,sportFont,48);ctx.strokeStyle=navy;ctx.lineWidth=9;ctx.strokeText("¡TENEMOS GANADOR!",540,363);ctx.fillText("¡TENEMOS GANADOR!",540,363);ctx.fillStyle=cream;canvasFontToFit(ctx,"TU PARTICIPACIÓN HACE POSIBLE GRANDES CAUSAS",900,25,sportFont,18);ctx.fillText("TU PARTICIPACIÓN HACE POSIBLE GRANDES CAUSAS",540,410);
  [[84,344,gold],[126,412,white],[940,350,red],[978,430,gold],[58,780,white],[1018,735,red],[112,1010,red],[968,1025,white]].forEach(([x,y,color],index)=>{ctx.save();ctx.translate(Number(x),Number(y));ctx.rotate((index%2?1:-1)*.45);ctx.fillStyle=String(color);ctx.fillRect(-6,-20,12,40);ctx.restore();});
  ctx.save();ctx.strokeStyle=gold;ctx.lineWidth=5;for(let x=105;x<=975;x+=145){ctx.beginPath();ctx.moveTo(x,458);ctx.lineTo(x+44,493);ctx.lineTo(x+88,458);ctx.stroke();ctx.fillStyle=x%2?red:gold;ctx.beginPath();ctx.moveTo(x+42,493);ctx.lineTo(x+64,493);ctx.lineTo(x+53,526);ctx.closePath();ctx.fill();}ctx.restore();
  roundedBox(ctx,350,438,380,54,27,gold,null,0);ctx.fillStyle=navy;ctx.font=`400 23px ${sportFont}`;ctx.fillText(gameDateLabel(result.gameId).toUpperCase(),540,474);
  roundedBox(ctx,86,528,908,270,26,"#051631d9",gold,4);ctx.fillStyle=gold;ctx.font=`400 27px ${sportFont}`;ctx.fillText("FELICIDADES",540,606);ctx.fillStyle=white;const winnerName=(square.participant||"CASILLA GANADORA").toUpperCase();canvasFontToFit(ctx,winnerName,800,74,sportFont,35);ctx.strokeStyle=navy;ctx.lineWidth=11;ctx.strokeText(winnerName,540,704);ctx.fillText(winnerName,540,704);ctx.fillStyle=gold;ctx.fillRect(250,752,580,5);
  const drawFootball=(x:number,y:number,rotation:number)=>{ctx.save();ctx.translate(x,y);ctx.rotate(rotation);ctx.fillStyle="#8a451f";ctx.strokeStyle="#e7a35c";ctx.lineWidth=5;ctx.beginPath();ctx.ellipse(0,0,74,45,0,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.strokeStyle=white;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-26,0);ctx.lineTo(26,0);ctx.stroke();[-18,-9,0,9,18].forEach((lx)=>{ctx.beginPath();ctx.moveTo(lx,-9);ctx.lineTo(lx,9);ctx.stroke();});ctx.restore();};drawFootball(140,930,-.32);drawFootball(940,930,.32);
  ctx.save();ctx.shadowColor="#f7b50066";ctx.shadowBlur=36;ctx.fillStyle=gold;ctx.beginPath();ctx.arc(540,940,119,0,Math.PI*2);ctx.fill();ctx.restore();ctx.fillStyle=navy;ctx.font=`400 27px ${sportFont}`;ctx.fillText("PREMIO",540,907);ctx.font=`400 67px ${sportFont}`;ctx.fillText("$300",540,971);ctx.font=`400 23px ${sportFont}`;ctx.fillText("USD",540,1006);
  roundedBox(ctx,68,1090,944,252,25,"#06152ff2",white,2);ctx.fillStyle=red;ctx.fillRect(68,1090,944,10);ctx.fillStyle="#9fb0c7";ctx.font=`800 18px ${bodyFont}`;ctx.fillText("MARCADOR FINAL · INCLUYE TIEMPOS EXTRAS",540,1136);
  const scoreTeams=[[game.visitor,result.visitorScore,"VISITANTE",290],[game.home,result.homeScore,"CASA",790]] as const;scoreTeams.forEach(([team,score,side,x])=>{ctx.fillStyle=gold;ctx.font=`400 18px ${sportFont}`;ctx.fillText(side,x,1181);ctx.fillStyle=white;canvasFontToFit(ctx,team.toUpperCase(),350,27,sportFont,15);ctx.fillText(team.toUpperCase(),x,1225);ctx.fillStyle=gold;ctx.font=`400 70px ${sportFont}`;ctx.fillText(String(score),x,1300);});ctx.fillStyle="#8fa0b8";ctx.font=`400 26px ${sportFont}`;ctx.fillText("VS",540,1252);
  roundedBox(ctx,155,1382,770,84,20,"#ffffff12",gold,2);ctx.fillStyle=cream;ctx.font=`700 22px ${bodyFont}`;ctx.fillText(`VISITANTE ${visitorDigit}  ×  CASA ${homeDigit}  =  CASILLA #${square.id}`,540,1434);
  ctx.fillStyle="#aebed3";ctx.font=`800 18px ${bodyFont}`;ctx.fillText("CASILLA COLOCADA POR",540,1516);ctx.fillStyle=white;const seller=(square.reservedByName||square.contact||"ROTARY JUÁREZ CONCORDIA").toUpperCase();canvasFontToFit(ctx,seller,800,35,sportFont,20);ctx.fillText(seller,540,1562);
  ctx.fillStyle=gold;canvasFontToFit(ctx,"¡GRACIAS POR JUGAR, GANAR Y AYUDAR!",900,31,sportFont,20);ctx.fillText("¡GRACIAS POR JUGAR, GANAR Y AYUDAR!",540,1642);ctx.fillStyle="#d5deeb";ctx.font=`600 22px ${bodyFont}`;ctx.fillText("Cada casilla fortalece proyectos que transforman vidas.",540,1682);
  const mottoW=365,mottoH=mottoW*(motto.height/motto.width);ctx.drawImage(motto,(1080-mottoW)/2,1710,mottoW,mottoH);
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob((value)=>value?resolve(value):reject(new Error("No se pudo crear la imagen")),"image/png"));return{blob,url:canvas.toDataURL("image/png")};
}

async function createReportFlyer(rows:ReportRow[]){
  const canvas=document.createElement("canvas");canvas.width=1080;canvas.height=1920;
  const ctx=canvas.getContext("2d");if(!ctx)throw new Error("Canvas no disponible");
  const styles=getComputedStyle(document.body),displayFont=styles.getPropertyValue("--font-display").trim()||"Arial Black",bodyFont=styles.getPropertyValue("--font-body").trim()||"Arial";
  const navy="#061b3e",gold="#f7b500",green="#168553",cream="#fff8e5",white="#ffffff";
  const stadium=await loadCanvasImage("/flyer-stadium-bg.png");ctx.drawImage(stadium,0,0,1080,1920);
  const shade=ctx.createLinearGradient(0,0,0,1920);shade.addColorStop(0,"#020a1de8");shade.addColorStop(.48,"#061b3ed1");shade.addColorStop(.82,"#031128dc");shade.addColorStop(1,"#02091899");ctx.fillStyle=shade;ctx.fillRect(0,0,1080,1920);ctx.fillStyle=gold;ctx.fillRect(0,0,1080,14);ctx.fillRect(0,1906,1080,14);
  const logo=await loadCanvasImage("/logo-crjc-white-gold.png"),logoW=430,logoH=logoW*(logo.height/logo.width);ctx.drawImage(logo,(1080-logoW)/2,30,logoW,logoH);
  ctx.textAlign="center";ctx.fillStyle=gold;ctx.font=`400 29px ${displayFont}`;ctx.fillText("AVANCE DE VENTAS · QUINIELA MNF 2026",540,286);ctx.fillStyle=white;ctx.font=`400 70px ${displayFont}`;ctx.fillText("¡VAMOS POR LAS 100!",540,370);ctx.fillStyle=cream;ctx.font=`600 27px ${bodyFont}`;ctx.fillText("Cada casilla vendida nos acerca a la meta y multiplica nuestra ayuda.",540,416);
  const totals={reserved:rows.reduce((n,row)=>n+row.reserved,0),paid:rows.reduce((n,row)=>n+row.paid,0),total:rows.reduce((n,row)=>n+row.total,0)};
  roundedBox(ctx,72,458,936,112,20,"#071a3be8",gold,3);const metrics=[[String(totals.reserved),"RESERVADAS",gold],[String(totals.paid),"PAGADAS",green],[String(totals.total),"COLOCADAS",white]];metrics.forEach(([value,label,color],index)=>{const x=228+index*312;ctx.fillStyle=color;ctx.font=`400 44px ${displayFont}`;ctx.fillText(value,x,510);ctx.fillStyle="#b9c7da";ctx.font=`800 17px ${bodyFont}`;ctx.fillText(label,x,544);});
  roundedBox(ctx,92,596,896,28,14,"#ffffff24",null,0);if(totals.total){roundedBox(ctx,92,596,Math.max(28,896*Math.min(totals.total/100,1)),28,14,gold,null,0);}ctx.fillStyle=white;ctx.font=`800 17px ${bodyFont}`;ctx.fillText(`${totals.total}% DE LA META`,540,657);
  const visibleRows=rows.slice(0,26),rowHeight=Math.max(34,Math.min(56,Math.floor(820/Math.max(visibleRows.length,1)))),tableY=692,tableH=58+visibleRows.length*rowHeight+58;
  roundedBox(ctx,60,tableY-18,960,tableH+36,24,"#03112bec",gold,3);ctx.fillStyle="#0d2e61";ctx.fillRect(82,tableY,916,58);ctx.textBaseline="middle";ctx.fillStyle=gold;ctx.font=`400 18px ${displayFont}`;ctx.textAlign="left";ctx.fillText("SOCIO",108,tableY+29);[["RESERVADAS",690],["PAGADAS",835],["TOTAL",960]].forEach(([label,x])=>{ctx.textAlign="center";ctx.fillText(String(label),Number(x),tableY+29);});
  if(!visibleRows.length){ctx.fillStyle=white;ctx.textAlign="center";ctx.font=`600 25px ${bodyFont}`;ctx.fillText("El avance aparecerá al registrar las primeras ventas.",540,tableY+120);}
  visibleRows.forEach((row,index)=>{const y=tableY+58+index*rowHeight;if(index%2===0){ctx.fillStyle="#ffffff0b";ctx.fillRect(82,y,916,rowHeight);}ctx.textBaseline="middle";ctx.fillStyle=white;ctx.textAlign="left";ctx.font=`700 ${Math.max(16,Math.min(22,rowHeight*.4))}px ${bodyFont}`;ctx.fillText(fitCanvasText(ctx,row.name,535),108,y+rowHeight/2);ctx.font=`400 ${Math.max(18,Math.min(24,rowHeight*.45))}px ${displayFont}`;[[row.reserved,690,gold],[row.paid,835,gold],[row.total,960,white]].forEach(([value,x,color])=>{ctx.fillStyle=String(color);ctx.textAlign="center";ctx.fillText(String(value||"—"),Number(x),y+rowHeight/2);});});
  const totalY=tableY+58+visibleRows.length*rowHeight;ctx.fillStyle="#0d2e61";ctx.fillRect(82,totalY,916,58);ctx.fillStyle=gold;ctx.fillRect(82,totalY,916,3);ctx.font=`400 21px ${displayFont}`;ctx.textAlign="left";ctx.fillText("TOTAL DEL EQUIPO",108,totalY+29);[[totals.reserved,690,gold],[totals.paid,835,gold],[totals.total,960,white]].forEach(([value,x,color])=>{ctx.fillStyle=String(color);ctx.textAlign="center";ctx.fillText(String(value),Number(x),totalY+29);});ctx.textBaseline="alphabetic";
  const tableBottom=totalY+76,messageY=tableBottom+(1847-tableBottom)/2-21;ctx.fillStyle=white;ctx.textAlign="center";ctx.font=`400 34px ${displayFont}`;ctx.fillText("¡EL SIGUIENTE AVANCE LO CONSTRUIMOS JUNTOS!",540,messageY);ctx.fillStyle="#c2cee0";ctx.font=`600 22px ${bodyFont}`;ctx.fillText("Comparte la causa, invita a participar y coloca tu próxima casilla.",540,messageY+42);if(rows.length>visibleRows.length){ctx.fillStyle=gold;ctx.font=`700 16px ${bodyFont}`;ctx.fillText(`Consulta el reporte completo en la app · ${rows.length-visibleRows.length} socios adicionales`,540,messageY+72);}roundedBox(ctx,75,1847,930,53,15,gold,null,0);ctx.fillStyle=navy;ctx.font=`400 25px ${displayFont}`;ctx.fillText("100 CASILLAS · 17 JUEGOS · UNA GRAN CAUSA",540,1882);
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob((value)=>value?resolve(value):reject(new Error("No se pudo crear la imagen")),"image/png"));return{blob,url:canvas.toDataURL("image/png")};
}

async function createFlyer(squares: Square[],language:"es"|"en"="es") {
  const canvas = document.createElement("canvas"); canvas.width = 1080; canvas.height = 1920;
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Canvas no disponible");
  const styles=getComputedStyle(document.body), displayFont=styles.getPropertyValue("--font-display").trim()||"Arial Black", bodyFont=styles.getPropertyValue("--font-body").trim()||"Arial";
  const navy = "#061b3e", blue = "#123a78", gold = "#f7b500", green = "#168553", cream = "#fff8e5", white = "#ffffff";
  const english=language==="en";
  const copy=english?{
    name:"MNF FOOTBALL POOL 2026",headline:"PLAY. WIN. GIVE BACK.",intro:"Pick a square and turn every Monday into support for a great cause.",offer:"$100 USD PER SQUARE   •   $300 USD PER GAME   •   17 GAMES",
    legend:["AVAILABLE","RESERVED","PAID"],rulesTitle:"CLEAR RULES, BIG FUN!",rules:["$100 USD per square. Payment in full by September 14, 2026.","$300 USD for each participating game; 17 chances to win.","Numbers are drawn at the start of the season and remain hidden until then.","Final score counts, including overtime; use the last digit for each team."],exampleTitle:"EXAMPLE · FINAL SCORE",exampleCopy:"Visitor 17 and Home 10: the winning square is where column 7 crosses row 0.",
    warning:"UNPAID SQUARES DO NOT PLAY  •  IF AN UNSOLD SQUARE WINS, THE CLUB KEEPS THE PRIZE  •  LISTED GAMES ONLY",cta:"JOIN TODAY AND SUPPORT PROJECTS THAT CHANGE LIVES!"
  }:{
    name:"QUINIELA MNF 2026",headline:"JUEGA. GANA. AYUDA.",intro:"Aparta una casilla y transforma cada lunes en una buena causa.",offer:"$100 USD POR CASILLA   •   $300 USD POR JUEGO   •   17 JUEGOS",
    legend:["DISPONIBLE","RESERVADA","PAGADA"],rulesTitle:"¡REGLAS CLARAS, DIVERSIÓN GRANDE!",rules:["$100 USD por casilla. Pago total antes del 14 de septiembre de 2026.","$300 USD por cada juego participante; tienes 17 oportunidades de ganar.","Los números se sortean al inicio de temporada y permanecen ocultos hasta entonces.","Cuenta el marcador final, incluidos tiempos extra, usando la unidad de cada equipo."],exampleTitle:"EJEMPLO · MARCADOR FINAL",exampleCopy:"Visitante 17 y Casa 10: gana la casilla donde la columna 7 cruza con el renglón 0.",
    warning:"NO PAGADAS NO JUEGAN  •  SI GANA UNA NO VENDIDA, EL PREMIO QUEDA EN EL CLUB  •  SOLO JUEGOS LISTADOS",cta:"¡PARTICIPA HOY Y APOYA PROYECTOS QUE CAMBIAN VIDAS!"
  };
  const [stadium,logo,mnfLogo,mottoEs,mottoEn] = await Promise.all([loadCanvasImage("/flyer-stadium-bg.png"),loadCanvasImage("/logo-crjc-white-gold.png"),loadCanvasImage("/logo-monday-night-football.png"),loadCanvasImage("/lema-rotario-2026-2027.png"),loadCanvasImage("/rotary-motto-2026-2027-en.png")]); ctx.drawImage(stadium,0,0,1080,1920);
  const shade=ctx.createLinearGradient(0,0,0,1920);shade.addColorStop(0,"#020a1dcc");shade.addColorStop(.46,"#061b3e99");shade.addColorStop(.78,"#031128b8");shade.addColorStop(1,"#02091866");ctx.fillStyle=shade;ctx.fillRect(0,0,1080,1920);
  ctx.save(); ctx.globalAlpha=.09; ctx.strokeStyle=gold; ctx.lineWidth=2; for(let y=34;y<780;y+=92){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(1080,y);ctx.stroke();} ctx.restore();
  ctx.fillStyle=gold; ctx.fillRect(0,0,1080,14); ctx.fillRect(0,1906,1080,14);

  const logoW=420, logoH=logoW*(logo.height/logo.width); ctx.drawImage(logo,62,34,logoW,logoH);const mnfW=178,mnfH=mnfW*(mnfLogo.height/mnfLogo.width);ctx.drawImage(mnfLogo,840,28,mnfW,mnfH);
  ctx.textAlign="center"; ctx.fillStyle=gold; ctx.font=`400 30px ${displayFont}`; ctx.fillText(copy.name,540,305);
  ctx.fillStyle=white; ctx.font=`400 72px ${displayFont}`; ctx.fillText(copy.headline,540,382);
  ctx.fillStyle=cream; ctx.font=`600 29px ${bodyFont}`; ctx.fillText(copy.intro,540,430);

  roundedBox(ctx,80,466,920,82,18,"#071a3bdd",gold,3); ctx.fillStyle=white; ctx.font=`400 27px ${displayFont}`; ctx.fillText(copy.offer,540,518);

  const legend=[{label:copy.legend[0],color:cream,text:navy},{label:copy.legend[1],color:gold,text:navy},{label:copy.legend[2],color:green,text:white}];
  ctx.textAlign="left"; legend.forEach((item,index)=>{const lx=154+index*285;ctx.fillStyle=item.color;ctx.fillRect(lx,575,24,24);ctx.fillStyle=white;ctx.font=`400 22px ${displayFont}`;ctx.fillText(item.label,lx+34,596);});

  const gridX=148, gridY=625, cell=74, gap=5;
  roundedBox(ctx,126,603,828,834,26,"#03112be8",gold,4);
  ctx.fillStyle=gold;ctx.textAlign="center";ctx.font=`400 17px ${displayFont}`;ctx.fillText(english?"VISITOR":"VISITANTE",540,620);ctx.save();ctx.translate(108,1020);ctx.rotate(-Math.PI/2);ctx.fillText(english?"HOME":"CASA",0,0);ctx.restore();
  squares.forEach((square,index)=>{const col=index%10,row=Math.floor(index/10),x=gridX+col*(cell+gap),y=gridY+row*(cell+gap);ctx.fillStyle=square.status==="paid"?green:square.status==="reserved"?gold:cream;ctx.fillRect(x,y,cell,cell);ctx.strokeStyle=square.status==="available"?"#c5c9cf":"#ffffff44";ctx.lineWidth=2;ctx.strokeRect(x,y,cell,cell);ctx.fillStyle=square.status==="paid"?white:navy;ctx.textAlign="center";ctx.textBaseline="middle";ctx.font=`400 29px ${displayFont}`;ctx.fillText(String(square.id),x+cell/2,y+cell/2+1);}); ctx.textBaseline="alphabetic";

  ctx.textAlign="left"; ctx.fillStyle=gold;canvasFontToFit(ctx,copy.rulesTitle,916,30,displayFont,22);ctx.fillText(copy.rulesTitle,82,1482);
  const rules=copy.rules.map((text,index)=>[String(index+1),text]);
  rules.forEach(([number,text],index)=>{const y=1522+index*42;ctx.fillStyle=gold;ctx.beginPath();ctx.arc(100,y-7,16,0,Math.PI*2);ctx.fill();ctx.fillStyle=navy;ctx.textAlign="center";ctx.font=`400 17px ${displayFont}`;ctx.fillText(number,100,y-1);ctx.fillStyle=white;ctx.textAlign="left";ctx.font=`600 16px ${bodyFont}`;drawWrappedText(ctx,text,130,y,535,18);});const motto=english?mottoEn:mottoEs,mottoW=250,mottoH=mottoW*(motto.height/motto.width),mottoY=1511+(150-mottoH)/2;ctx.fillStyle=gold;ctx.fillRect(700,1505,3,158);roundedBox(ctx,725,1505,285,158,18,"#051631a8",null,0);ctx.drawImage(motto,742,mottoY,mottoW,mottoH);
  roundedBox(ctx,70,1680,940,126,20,"#071a3be8",gold,2);ctx.textAlign="center";ctx.fillStyle=gold;ctx.font=`400 18px ${displayFont}`;ctx.fillText(copy.exampleTitle,540,1708);ctx.fillStyle="#aebed3";ctx.font=`800 12px ${bodyFont}`;ctx.fillText(english?"VISITOR":"VISITANTE",220,1742);ctx.fillText(english?"HOME":"CASA",860,1742);ctx.fillStyle=white;ctx.font=`400 38px ${displayFont}`;ctx.fillText("17",220,1777);ctx.fillText("10",860,1777);roundedBox(ctx,420,1726,240,55,12,gold,null,0);ctx.fillStyle=navy;ctx.font=`400 30px ${displayFont}`;ctx.fillText("7 × 0",540,1764);ctx.fillStyle=white;ctx.font=`600 15px ${bodyFont}`;ctx.fillText(copy.exampleCopy,540,1796);
  ctx.fillStyle="#b8c7dc";ctx.textAlign="center";ctx.font=`800 15px ${bodyFont}`;ctx.fillText(copy.warning,540,1838);
  roundedBox(ctx,70,1860,940,42,13,gold,null,0); ctx.fillStyle=navy; ctx.textAlign="center"; ctx.font=`400 24px ${displayFont}`; ctx.fillText(copy.cta,540,1889);
  const blob = await new Promise<Blob>((resolve,reject)=>canvas.toBlob((value)=>value?resolve(value):reject(new Error("No se pudo crear la imagen")),"image/png"));
  return { blob, url:canvas.toDataURL("image/png") };
}

function roundedBox(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number,fill:string,stroke:string|null,width:number){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}}
function drawWrappedText(ctx:CanvasRenderingContext2D,text:string,x:number,y:number,maxWidth:number,lineHeight:number){const words=text.split(" ");let line="",lineY=y;for(const word of words){const test=`${line}${word} `;if(line&&ctx.measureText(test).width>maxWidth){ctx.fillText(line.trim(),x,lineY);line=`${word} `;lineY+=lineHeight;}else line=test;}if(line)ctx.fillText(line.trim(),x,lineY);}
function fitCanvasText(ctx:CanvasRenderingContext2D,text:string,maxWidth:number){if(ctx.measureText(text).width<=maxWidth)return text;let value=text;while(value.length>1&&ctx.measureText(`${value}…`).width>maxWidth)value=value.slice(0,-1);return `${value}…`;}
function canvasFontToFit(ctx:CanvasRenderingContext2D,text:string,maxWidth:number,maxSize:number,font:string,minSize=14){let size=maxSize;ctx.font=`400 ${size}px ${font}`;while(size>minSize&&ctx.measureText(text).width>maxWidth){size-=1;ctx.font=`400 ${size}px ${font}`;}return size;}
function loadCanvasImage(src:string){return new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error("No se pudo cargar el logo"));image.src=src;});}
function flyerFilename(type:FlyerType){return type==="winner"?"ganador-quiniela-mnf-2026.png":type==="report"?"avance-quiniela-mnf-2026.png":type==="board-en"?"mnf-football-pool-2026-en.png":"quiniela-mnf-2026.png";}
function downloadFlyer(blob:Blob,type:FlyerType="board"){const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=flyerFilename(type);link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

function isOwned(square:Square,me:Member){ return Boolean(square.reservedByEmail) && square.reservedByEmail.toLowerCase()===me.email.toLowerCase(); }
function labelFor(status:Status){ return status==="available"?"Disponible":status==="reserved"?"Reservada":"Pagada"; }
function roleLabel(role:Role){ return role==="admin"?"Administrador":role==="treasury"?"Tesorería":"Usuario"; }
function roleIcon(role:Role){ return role==="admin"?"A":role==="treasury"?"T":"U"; }
function roleHelp(role:Role,boardLocked=false){ if(role==="admin")return "Puedes modificar cualquier dato, administrar accesos y configurar los números.";if(boardLocked)return role==="treasury"?"El tablero está cerrado. Sólo puedes confirmar el pago de casillas reservadas.":"El tablero está cerrado. Puedes consultar las casillas, pero ya no reservarlas ni editarlas.";return role==="treasury"?"Puedes reservar casillas y confirmar el pago de cualquier reservación.":"Puedes reservar casillas disponibles y actualizar los datos de las que tú vendiste. Tesorería confirmará los pagos."; }
function initials(name:string){ return name.split(/\s+/).filter(Boolean).slice(0,2).map((part)=>part[0]).join("").toUpperCase(); }
function cleanDigits(value:string){ return value.replace(/\D/g,"").slice(0,10); }
function isDigitSet(value:string){ return value.length===10&&new Set(value).size===10&&[...value].every((digit)=>"0123456789".includes(digit)); }
function gameDateLabel(gameId:number){const game=games[gameId-1];return game?`${game.date} ${gameId===17?"2027":"2026"}`:"";}
function passwordMeetsPolicy(value:string){ return value.length>=8&&value.length<=128&&/[a-z]/.test(value)&&/[A-Z]/.test(value)&&/[0-9]/.test(value)&&/[^A-Za-z0-9]/.test(value); }
function activityIcon(action:string){ return action==="paid"?"$":action==="reserved"?"R":action==="released"?"↺":action==="game_result_updated"?"J":"·"; }
function activityText(item:Activity){ if(item.action==="paid")return `marcó como pagada la casilla ${item.squareId}`;if(item.action==="reserved")return `reservó la casilla ${item.squareId} para ${item.details}`;if(item.action==="released")return `liberó la casilla ${item.squareId}`;if(item.action==="member_updated")return `actualizó el acceso de ${item.details}`;if(item.action==="member_removed")return `retiró el acceso de ${item.details}`;if(item.action==="numbers_updated")return "actualizó los números de juego";if(item.action==="game_result_updated")return `registró el resultado: ${item.details}`;return `actualizó la casilla ${item.squareId}`; }
function formatDate(value:string){ try{return new Intl.DateTimeFormat("es-MX",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}).format(new Date(value));}catch{return value;} }
