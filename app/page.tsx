"use client";

import { useEffect, useMemo, useState } from "react";

type Status = "available" | "reserved" | "paid";
type Role = "admin" | "user" | "treasury";
type Square = {
  id: number; status: Status; participant: string; contact: string; phone: string;
  reservedByEmail: string; reservedByName: string; reservedAt: string;
  paidByEmail: string; paidByName: string; paidAt: string;
};
type Member = { email: string; name: string; role: Role; active: number };
type Activity = { id: number; squareId: number | null; action: string; actorName: string; actorRole: Role; previousStatus: string; newStatus: string; details: string; createdAt: string };
type Game = { date: string; visitor: string; home: string };

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
  const [generatingFlyer, setGeneratingFlyer] = useState(false);
  const [me, setMe] = useState<Member | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [accessState, setAccessState] = useState<"loading" | "ready" | "signin" | "denied">("loading");
  const [accessEmail, setAccessEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  async function loadBoard() {
    try {
      const response = await fetch("/api/board", { cache: "no-store" });
      const data = await response.json();
      if (response.status === 401) { setAccessState("signin"); return; }
      if (response.status === 403) { setAccessEmail(data.email ?? ""); setAccessState("denied"); return; }
      if (!response.ok) throw new Error(data.error || "No fue posible cargar el tablero");
      setSquares(data.squares); setVisitorDigits(data.settings.visitorDigits ?? ""); setHomeDigits(data.settings.homeDigits ?? "");
      setMe(data.me); setMembers(data.members ?? []); setActivity(data.activity ?? []); setAccessState("ready");
    } catch (error) { setNotice(error instanceof Error ? error.message : "No pudimos conectar con el tablero."); }
  }

  useEffect(() => { loadBoard(); }, []);

  const counts = useMemo(() => ({ available:squares.filter((s) => s.status === "available").length, reserved:squares.filter((s) => s.status === "reserved").length, paid:squares.filter((s) => s.status === "paid").length }), [squares]);
  const report = useMemo(() => {
    const rows = new Map<string, { name:string; reserved:number; paid:number; total:number }>();
    squares.filter((square) => square.status !== "available").forEach((square) => {
      const name = square.reservedByName || square.contact || "Sin asignar";
      const row = rows.get(name) ?? { name, reserved:0, paid:0, total:0 };
      if (square.status === "reserved") row.reserved += 1; else row.paid += 1;
      row.total += 1; rows.set(name, row);
    });
    return [...rows.values()].sort((a,b) => b.total - a.total || a.name.localeCompare(b.name));
  }, [squares]);

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

  async function saveMember(member: Member, originalEmail = "") {
    setSaving(true);
    try { const data = await put({ action:"member", ...member, originalEmail, active:Boolean(member.active) }); setMembers(data.members); setNotice(`Acceso de ${member.name} actualizado`); return true; }
    catch (error) { setNotice(error instanceof Error ? error.message : "No se pudo actualizar el acceso."); return false; }
    finally { setSaving(false); }
  }

  async function removeMember(member: Member) {
    setSaving(true);
    try { const data = await put({ action:"member_remove", email:member.email }); setMembers(data.members); setNotice(`Acceso de ${member.name} retirado`); return true; }
    catch (error) { setNotice(error instanceof Error ? error.message : "No se pudo retirar el acceso."); return false; }
    finally { setSaving(false); }
  }

  async function openFlyer() {
    setGeneratingFlyer(true);
    try {
      const result = await createFlyer(squares);
      setFlyerUrl(result.url); setFlyerBlob(result.blob); setShowFlyer(true);
    } catch { setNotice("No fue posible generar el flier. Intenta nuevamente."); }
    finally { setGeneratingFlyer(false); }
  }

  async function copyFlyer() {
    if (!flyerBlob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": flyerBlob })]);
      setNotice("Flier copiado. Ya puedes pegarlo en WhatsApp.");
    } catch { downloadFlyer(flyerBlob); setNotice("Tu dispositivo no permite copiar imágenes; el flier se descargó."); }
  }

  async function shareFlyer() {
    if (!flyerBlob) return;
    const file = new File([flyerBlob], "quiniela-mnf-2026.png", { type:"image/png" });
    try {
      if (navigator.share && navigator.canShare?.({ files:[file] })) await navigator.share({ title:"Quiniela MNF 2026", text:"¡Participa por una buena causa! Aparta tu casilla de la Quiniela MNF 2026.", files:[file] });
      else await copyFlyer();
    } catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) setNotice("No fue posible compartir; puedes copiar o descargar el flier."); }
  }

  if (accessState !== "ready") return <AccessScreen state={accessState} email={accessEmail} />;
  const filteredIds = new Set(squares.filter((square) => filter === "all" || square.status === filter).map((square) => square.id));

  return <main>
    <header className="topbar">
      <img className="club-logo header-logo" src="/logo-crjc.png" alt="Rotary Juárez Concordia" />
      <div className="brand-copy"><h1>Quiniela MNF <span>2026</span></h1></div>
      <div className="account-chip"><div><strong>{me?.name}</strong><span>{roleLabel(me?.role ?? "user")}</span></div><a href="/signout-with-chatgpt?return_to=%2F" aria-label="Cerrar sesión">Salir</a></div>
    </header>

    <section className="hero sports-hero">
      <div className="yard-markers" aria-hidden="true"><span>10</span><span>20</span><span>30</span><span>40</span><span>50</span></div>
      <div className="hero-copy"><span className="eyebrow">Lotería anual pro ayuda · Temporada 2026</span><h2>Un tablero. <em>17 oportunidades</em> de ganar.</h2><p>Cada casilla apoya proyectos de salud, subvenciones humanitarias y el combate contra la polio.</p></div>
      <div className="hero-sports" aria-hidden="true"><div className="football"><span className="laces"><i/><i/><i/><i/></span></div><div className="scoreboard"><span>PREMIO POR JUEGO</span><strong>$300</strong><small>USD · MARCADOR FINAL</small></div></div>
      <div className="goalpost" aria-hidden="true"><i/><b/><span/></div>
    </section>

    <div className="sports-strip" aria-label="Datos principales de la quiniela"><div><span className="mini-football" aria-hidden="true"/><strong>17</strong><small>Juegos MNF</small></div><div><span className="yard-icon" aria-hidden="true">50</span><strong>100</strong><small>Casillas</small></div><div><span className="trophy-icon" aria-hidden="true">★</span><strong>$100</strong><small>Por casilla</small></div><div><span className="heart-icon" aria-hidden="true">♥</span><strong>1</strong><small>Gran causa</small></div></div>

    <nav className="tabs" aria-label="Secciones">
      <button className={tab === "board" ? "active" : ""} onClick={() => setTab("board")}><span>▦</span> Tablero</button>
      <button className={tab === "games" ? "active" : ""} onClick={() => setTab("games")}><span>◷</span> Juegos</button>
      <button className={tab === "reports" ? "active" : ""} onClick={() => setTab("reports")}><span>≡</span> Reportes</button>
      <button className={tab === "rules" ? "active" : ""} onClick={() => setTab("rules")}><span>i</span> Reglas</button>
    </nav>

    {notice && <button className="notice" onClick={() => setNotice("")} aria-label="Cerrar aviso">{notice}<span>×</span></button>}

    {tab === "board" && <section className="content board-section">
      <div className="section-heading"><div><p className="kicker">Tablero oficial · 100 casillas</p><h3>Elige tu número de la suerte</h3></div><div className="heading-actions"><button className="flyer-button" onClick={openFlyer} disabled={generatingFlyer}>{generatingFlyer ? "Generando…" : "🏈 Generar flier"}</button>{me?.role === "admin" && <button className="outline-button" onClick={() => setShowDigits(true)}>⚙ Números de juego</button>}</div></div>
      <div className="summary-grid">
        <button className={filter === "available" ? "summary active" : "summary"} onClick={() => setFilter(filter === "available" ? "all" : "available")}><span className="dot available"/><div><strong>{counts.available}</strong><small>Disponibles</small></div></button>
        <button className={filter === "reserved" ? "summary active" : "summary"} onClick={() => setFilter(filter === "reserved" ? "all" : "reserved")}><span className="dot reserved"/><div><strong>{counts.reserved}</strong><small>Reservadas</small></div></button>
        <button className={filter === "paid" ? "summary active" : "summary"} onClick={() => setFilter(filter === "paid" ? "all" : "paid")}><span className="dot paid"/><div><strong>{counts.paid}</strong><small>Pagadas</small></div></button>
        <div className="summary raised"><span className="dot goal">$</span><div><strong>${(counts.reserved + counts.paid) * 100}</strong><small>Comprometidos</small></div></div>
      </div>
      <div className="board-card"><div className="board-meta"><div className="legend"><span><i className="available"/>Disponible</span><span><i className="reserved"/>Reservada</span><span><i className="paid"/>Pagada</span></div><p>Toca una casilla para ver sus datos</p></div>
        <div className="board-scroll"><div className="visitor-label">VISITANTE</div><div className="board-with-axis"><div className="home-label">CASA</div><div className="grid-shell">
          <div className="corner-cell">VS</div>{(visitorDigits || "          ").padEnd(10).slice(0,10).split("").map((digit,index) => <div className="digit top" key={`v-${index}`}>{digit || "?"}</div>)}
          {(homeDigits || "          ").padEnd(10).slice(0,10).split("").map((digit,row) => <div className="row-group" key={`row-${row}`}><div className="digit side">{digit || "?"}</div>{squares.slice(row*10,row*10+10).map((square) => <button key={square.id} className={`square ${square.status} ${filteredIds.has(square.id) ? "" : "dimmed"} ${isOwned(square, me!) ? "mine" : ""}`} onClick={() => setSelected(square)} aria-label={`Casilla ${square.id}, ${labelFor(square.status)}${square.participant ? `, ${square.participant}` : ""}`}><span>{square.id}</span>{square.status !== "available" && <b>{initials(square.participant)}</b>}{isOwned(square, me!) && <i className="mine-badge">Mía</i>}</button>)}</div>)}
        </div></div></div>
      </div>
      <div className="permission-note"><span>{roleIcon(me!.role)}</span><div><strong>Acceso: {roleLabel(me!.role)}</strong><p>{roleHelp(me!.role)}</p></div></div>
      <div className="deadline"><span>!</span><div><strong>Fecha límite de pago</strong><p>Las casillas deben cubrirse en su totalidad antes del 14 de septiembre de 2026.</p></div></div>
    </section>}

    {tab === "games" && <Games />}
    {tab === "rules" && <Rules />}
    {tab === "reports" && <Reports rows={report} squares={squares} activity={activity} me={me!} members={members} saving={saving} onSaveMember={saveMember} onRemoveMember={removeMember} />}

    <footer><div className="footer-logo-wrap"><img className="club-logo footer-logo" src="/logo-crjc.png" alt="Rotary Juárez Concordia" /></div><p>Genera un impacto duradero</p><span>Actualizado 13 julio 2026</span></footer>

    {selected && <SquareModal square={selected} me={me!} members={members} saving={saving} onClose={() => setSelected(null)} onSave={saveSquare} />}
    {showFlyer && flyerUrl && <div className="modal-backdrop flyer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowFlyer(false)}><section className="flyer-modal" role="dialog" aria-modal="true" aria-labelledby="flyer-title"><button className="modal-close" onClick={() => setShowFlyer(false)} aria-label="Cerrar">×</button><div className="flyer-modal-head"><p className="kicker">Listo para compartir</p><h3 id="flyer-title">Flier de la quiniela</h3><p>La imagen refleja el estado actual del tablero.</p></div><div className="flyer-preview"><img src={flyerUrl} alt="Flier vertical de la Quiniela MNF 2026 con tablero y reglas"/></div><div className="flyer-actions"><button className="whatsapp-button" onClick={shareFlyer}>Compartir</button><button className="copy-button" onClick={copyFlyer}>Copiar imagen</button><button className="download-button" onClick={() => flyerBlob && downloadFlyer(flyerBlob)}>Guardar PNG</button></div></section></div>}
    {showDigits && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowDigits(false)}><section className="modal digits-modal" role="dialog" aria-modal="true" aria-labelledby="digits-title"><button className="modal-close" onClick={() => setShowDigits(false)} aria-label="Cerrar">×</button><p className="kicker">Inicio de temporada</p><h3 id="digits-title">Números de juego</h3><p className="modal-help">Déjalos vacíos hasta el sorteo. Después, ingresa los 10 dígitos en el orden asignado.</p><label>Columnas — visitante<input value={visitorDigits} onChange={(e) => setVisitorDigits(cleanDigits(e.target.value))} inputMode="numeric" maxLength={10} placeholder="Ej. 7451029863" /></label><label>Renglones — casa<input value={homeDigits} onChange={(e) => setHomeDigits(cleanDigits(e.target.value))} inputMode="numeric" maxLength={10} placeholder="Ej. 0294831756" /></label><div className="modal-actions"><button className="secondary" onClick={() => {setVisitorDigits("");setHomeDigits("");}}>Limpiar</button><button className="primary" onClick={saveDigits} disabled={saving}>{saving ? "Guardando…" : "Guardar números"}</button></div></section></div>}
  </main>;
}

function AccessScreen({ state, email }:{ state:"loading"|"signin"|"denied"; email:string }) {
  return <main className="access-screen"><div className="access-card"><img src="/logo-crjc.png" alt="Rotary Juárez Concordia"/><p className="kicker">Quiniela MNF 2026</p>{state === "loading" ? <><h1>Preparando tu tablero</h1><div className="access-loader"/></> : state === "signin" ? <><h1>Identifica tu acceso</h1><p>Inicia sesión para consultar el tablero y aplicar los permisos de tu rol.</p><a className="access-button" href="/signin-with-chatgpt?return_to=%2F">Iniciar sesión con ChatGPT</a></> : <><h1>Acceso pendiente</h1><p>La cuenta <strong>{email || "actual"}</strong> todavía no está registrada. Pide al administrador que te agregue desde Reportes → Accesos.</p><a className="access-button secondary-link" href="/signout-with-chatgpt?return_to=%2F">Usar otra cuenta</a></>}</div></main>;
}

function SquareModal({ square, me, members, saving, onClose, onSave }:{ square:Square; me:Member; members:Member[]; saving:boolean; onClose:()=>void; onSave:(square:Square)=>void }) {
  const [draft,setDraft] = useState(square);
  const owns = isOwned(square,me); const admin = me.role === "admin"; const treasuryOther = me.role === "treasury" && square.status === "reserved" && !owns;
  const editableDetails = admin || owns || square.status === "available";
  const statuses = (["available","reserved","paid"] as Status[]);
  const allowed = (status:Status) => admin || (square.status === "available" && status === "reserved") || (owns && square.status === "reserved" && (status === "reserved" || status === "paid")) || (owns && square.status === "paid" && status === "paid") || (treasuryOther && status === "paid");
  const canSave = admin || allowed(draft.status);
  function update(field:keyof Square,value:string){ setDraft((current) => ({...current,[field]:value})); }
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="square-title"><button className="modal-close" onClick={onClose} aria-label="Cerrar">×</button><div className={`modal-number ${draft.status}`}>{draft.id}</div><div><p className="kicker">Detalle de casilla</p><h3 id="square-title">Casilla #{draft.id}</h3></div>
    <div className="status-picker" role="group" aria-label="Estado de la casilla">{statuses.map((status) => <button key={status} disabled={!allowed(status)} className={draft.status === status ? `active ${status}` : status} onClick={() => setDraft((current) => ({...current,status}))}><i/>{labelFor(status)}</button>)}</div>
    {draft.status !== "available" && <>{editableDetails ? <><label>Nombre de quien juega<input autoFocus value={draft.participant} onChange={(e) => update("participant",e.target.value)} placeholder="Nombre completo"/></label><label>Teléfono <span>(opcional)</span><input value={draft.phone} onChange={(e) => update("phone",e.target.value)} inputMode="tel" placeholder="(656) 000 0000"/></label></> : <div className="readonly-data"><small>JUGADOR</small><strong>{draft.participant}</strong>{draft.phone && <span>{draft.phone}</span>}</div>}
      {admin ? <label>Socio que la vendió<select value={draft.reservedByName} onChange={(e) => { const member = members.find((item) => item.name === e.target.value); setDraft((current) => ({...current,reservedByName:e.target.value,reservedByEmail:member?.email ?? current.reservedByEmail})); }}><option value="">Selecciona un socio registrado</option>{draft.reservedByName && !members.some((member) => member.name === draft.reservedByName) && <option value={draft.reservedByName}>{draft.reservedByName} (registro anterior)</option>}{members.filter((member) => member.active).map((member) => <option key={member.email} value={member.name}>{member.name}</option>)}</select></label> : <div className="ownership"><span>Vendida por</span><strong>{draft.reservedByName || (square.status === "available" ? me.name : "Sin asignar")}</strong></div>}
      {draft.status === "paid" && <div className="payment-proof"><span>Pago confirmado por</span><strong>{draft.paidByName || "Se registrará al guardar"}</strong></div>}
    </>}
    {!canSave && <p className="locked-message">Esta casilla fue vendida por otro socio. Puedes consultar sus datos, pero no modificarlos.</p>}
    <div className="modal-actions"><button className="secondary" onClick={onClose}>Cerrar</button>{canSave && <button className="primary" disabled={saving || (draft.status !== "available" && (!draft.participant.trim() || (admin && !draft.reservedByName.trim())))} onClick={() => onSave(draft)}>{saving ? "Guardando…" : treasuryOther ? "Confirmar pago" : "Guardar cambios"}</button>}</div>
  </section></div>;
}

function Reports({ rows, squares, activity, me, members, saving, onSaveMember, onRemoveMember }:{ rows:{name:string;reserved:number;paid:number;total:number}[]; squares:Square[]; activity:Activity[]; me:Member; members:Member[]; saving:boolean; onSaveMember:(member:Member,originalEmail?:string)=>Promise<boolean>; onRemoveMember:(member:Member)=>Promise<boolean> }) {
  const [reportView,setReportView] = useState<"summary"|"activity"|"access">("summary");
  const [draft,setDraft] = useState<Member>({email:"",name:"",role:"user",active:1});
  const [editingEmail,setEditingEmail] = useState("");
  const resetMemberForm = () => { setDraft({email:"",name:"",role:"user",active:1}); setEditingEmail(""); };
  const totals = { reserved:rows.reduce((n,row)=>n+row.reserved,0), paid:rows.reduce((n,row)=>n+row.paid,0), total:rows.reduce((n,row)=>n+row.total,0) };
  return <section className="content reports-section"><div className="section-heading"><div><p className="kicker">Control y seguimiento</p><h3>Reportes</h3></div><span className="year-pill">{squares.filter((s)=>s.status!=="available").length} vendidas</span></div>
    <div className="report-switch"><button className={reportView==="summary"?"active":""} onClick={()=>setReportView("summary")}>Sumario por socio</button><button className={reportView==="activity"?"active":""} onClick={()=>setReportView("activity")}>Actividad</button>{me.role==="admin"&&<button className={reportView==="access"?"active":""} onClick={()=>setReportView("access")}>Accesos</button>}</div>
    {reportView === "summary" && <div className="report-card"><div className="report-card-head"><div><h4>Casillas reservadas y pagadas por socio</h4><p>Las casillas se atribuyen al socio que realizó la venta.</p></div><div className="report-value"><strong>${totals.paid*100}</strong><span>cobrado</span></div></div><div className="report-table-wrap"><table className="report-table"><thead><tr><th>Socio</th><th>Reservada</th><th>Pagada</th><th>Total</th></tr></thead><tbody>{rows.map((row)=><tr key={row.name}><td>{row.name}</td><td>{row.reserved || ""}</td><td>{row.paid || ""}</td><td><strong>{row.total}</strong></td></tr>)}</tbody><tfoot><tr><td>Total general</td><td>{totals.reserved}</td><td>{totals.paid}</td><td>{totals.total}</td></tr></tfoot></table></div></div>}
    {reportView === "activity" && <div className="report-card"><div className="report-card-head"><div><h4>Actividad reciente</h4><p>Quién reservó, cobró o modificó cada casilla.</p></div></div><div className="activity-list">{activity.length ? activity.map((item)=><article key={item.id}><span className={`activity-icon ${item.action}`}>{activityIcon(item.action)}</span><div><strong>{item.actorName}</strong><p>{activityText(item)}</p><small>{formatDate(item.createdAt)} · {roleLabel(item.actorRole)}</small></div>{item.squareId&&<b>#{item.squareId}</b>}</article>) : <p className="empty-report">La actividad nueva aparecerá aquí.</p>}</div></div>}
    {reportView === "access" && <div className="access-management"><div className="member-form report-card"><div className="report-card-head"><div><h4>{editingEmail ? "Editar acceso" : "Agregar acceso"}</h4><p>Puedes actualizar nombre, correo, nivel y estado del socio.</p></div>{editingEmail && <button className="form-cancel" onClick={resetMemberForm}>Cancelar</button>}</div><div className="member-form-grid"><label>Nombre<input value={draft.name} onChange={(e)=>setDraft({...draft,name:e.target.value})} placeholder="Nombre del socio"/></label><label>Correo de acceso<input value={draft.email} onChange={(e)=>setDraft({...draft,email:e.target.value})} type="email" placeholder="socio@correo.com"/></label><label>Nivel<select value={draft.role} onChange={(e)=>setDraft({...draft,role:e.target.value as Role})}><option value="user">Usuario</option><option value="treasury">Tesorería</option><option value="admin">Administrador</option></select></label><label>Estado<select value={draft.active} onChange={(e)=>setDraft({...draft,active:Number(e.target.value)})}><option value={1}>Activo</option><option value={0}>Suspendido</option></select></label></div><button className="primary member-save" disabled={saving||!draft.name||!draft.email} onClick={async()=>{if(await onSaveMember(draft,editingEmail))resetMemberForm();}}>{saving?"Guardando…":editingEmail?"Guardar cambios":"Agregar acceso"}</button></div>
      <div className="report-card member-list"><div className="report-card-head"><div><h4>Personas autorizadas</h4><p>{members.filter((member)=>member.active).length} accesos activos</p></div></div>{members.map((member)=><article key={member.email}><div><strong>{member.name}</strong><span>{member.email}</span></div><span className={member.active?"member-active":"member-inactive"}>{member.active?roleLabel(member.role):"Suspendido"}</span><div className="member-actions"><button className="member-edit" onClick={()=>{setDraft({...member});setEditingEmail(member.email);}}>Editar</button><button className="member-remove" disabled={member.email===me.email||saving} onClick={async()=>{if(window.confirm(`¿Retirar el acceso de ${member.name}?`)&&await onRemoveMember(member)){if(editingEmail===member.email)resetMemberForm();}}}>Retirar</button></div></article>)}</div>
    </div>}
  </section>;
}

function Games(){ return <section className="content games-section"><div className="section-heading"><div><p className="kicker">Calendario oficial</p><h3>17 lunes de emoción</h3></div><span className="year-pill">2026–27</span></div><div className="games-list">{games.map((game,index)=><article className="game" key={`${game.date}-${game.visitor}`}><div className="game-number"><span>JUEGO</span><strong>{String(index+1).padStart(2,"0")}</strong></div><div className="game-date">{game.date}</div><div className="matchup"><div><small>VISITANTE</small><strong>{game.visitor}</strong></div><span>@</span><div><small>CASA</small><strong>{game.home}</strong></div></div><div className="monday">LUN<br/>7:00</div></article>)}</div></section>; }

function Rules(){ const rules=[["$100 USD por casilla","El apoyo debe cubrirse totalmente antes del 14 de septiembre de 2026."],["$300 USD por juego","Puedes ganar cada vez que tu marcador resulte premiado durante los 17 juegos."],["Los números se revelan al inicio","Las casillas se eligen al azar. Los dígitos permanecen ocultos hasta iniciar la temporada."],["Cuenta el marcador final","Se consideran tiempos extras y solamente la unidad del resultado de cada equipo."]]; return <section className="content rules-section"><div className="section-heading"><div><p className="kicker">Cómo se juega</p><h3>Reglas claras, diversión grande</h3></div></div><div className="rules-grid">{rules.map(([title,body],index)=><article key={title}><span>{index+1}</span><div><h4>{title}</h4><p>{body}</p></div></article>)}</div><div className="example"><span className="example-tag">EJEMPLO</span><h4>Visitante 17 — Casa 10</h4><p>Gana la casilla donde la columna <strong>7</strong> cruza con el renglón <strong>0</strong>.</p><div className="score-example"><div><small>VISITANTE</small><strong>17</strong></div><span>→</span><div className="winning-square"><small>CASILLA</small><strong>7 × 0</strong></div><span>←</span><div><small>CASA</small><strong>10</strong></div></div></div><div className="warnings"><p>Las casillas no pagadas totalmente no juegan.</p><p>Si gana una casilla no vendida, el premio se queda en el club.</p><p>Solo participan los juegos aquí listados.</p></div></section>; }

async function createFlyer(squares: Square[]) {
  const canvas = document.createElement("canvas"); canvas.width = 1080; canvas.height = 1920;
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Canvas no disponible");
  const navy = "#061b3e", blue = "#123a78", gold = "#f7b500", green = "#168553", cream = "#fff8e5", white = "#ffffff";
  const background = ctx.createLinearGradient(0,0,1080,1920); background.addColorStop(0,"#04142f"); background.addColorStop(.55,navy); background.addColorStop(1,"#0b3268"); ctx.fillStyle=background; ctx.fillRect(0,0,1080,1920);
  ctx.save(); ctx.globalAlpha=.08; ctx.strokeStyle=white; ctx.lineWidth=3; for(let y=30;y<1920;y+=90){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(1080,y);ctx.stroke();} for(let x=90;x<1080;x+=180){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,1920);ctx.stroke();} ctx.restore();
  ctx.fillStyle=gold; ctx.fillRect(0,0,1080,14); ctx.fillRect(0,1906,1080,14);

  const logo = await loadCanvasImage("/logo-crjc-white-gold.png"); const logoW=480, logoH=logoW*(logo.height/logo.width); ctx.drawImage(logo,(1080-logoW)/2,34,logoW,logoH);
  ctx.textAlign="center"; ctx.fillStyle=gold; ctx.font="800 28px Arial"; ctx.fillText("QUINIELA MNF 2026",540,305);
  ctx.fillStyle=white; ctx.font="900 70px Arial"; ctx.fillText("JUEGA. GANA. AYUDA.",540,382);
  ctx.fillStyle=cream; ctx.font="500 29px Arial"; ctx.fillText("Aparta una casilla y transforma cada lunes en una buena causa.",540,430);

  roundedBox(ctx,80,466,920,82,18,"#0d2b5d",gold,3); ctx.fillStyle=white; ctx.font="800 27px Arial"; ctx.fillText("$100 USD POR CASILLA   •   $300 USD POR JUEGO   •   17 JUEGOS",540,518);

  const counts={available:squares.filter(s=>s.status==="available").length,reserved:squares.filter(s=>s.status==="reserved").length,paid:squares.filter(s=>s.status==="paid").length};
  const legend=[{label:`${counts.available} DISPONIBLES`,color:cream,text:navy},{label:`${counts.reserved} RESERVADAS`,color:gold,text:navy},{label:`${counts.paid} PAGADAS`,color:green,text:white}];
  let lx=98; ctx.textAlign="left"; for(const item of legend){ctx.fillStyle=item.color;ctx.fillRect(lx,575,24,24);ctx.fillStyle=white;ctx.font="800 22px Arial";ctx.fillText(item.label,lx+34,596);lx+=item.label.length*14+72;}

  const gridX=90, gridY=625, cell=84, gap=6;
  roundedBox(ctx,68,603,944,944,26,"#03112b",gold,4);
  squares.forEach((square,index)=>{const col=index%10,row=Math.floor(index/10),x=gridX+col*(cell+gap),y=gridY+row*(cell+gap);ctx.fillStyle=square.status==="paid"?green:square.status==="reserved"?gold:cream;ctx.fillRect(x,y,cell,cell);ctx.strokeStyle=square.status==="available"?"#c5c9cf":"#ffffff44";ctx.lineWidth=2;ctx.strokeRect(x,y,cell,cell);ctx.fillStyle=square.status==="paid"?white:navy;ctx.textAlign="center";ctx.textBaseline="middle";ctx.font="900 29px Arial";ctx.fillText(String(square.id),x+cell/2,y+cell/2+1);}); ctx.textBaseline="alphabetic";

  ctx.textAlign="left"; ctx.fillStyle=gold; ctx.font="900 30px Arial"; ctx.fillText("REGLAS DEL JUEGO",82,1592);
  const rules=[
    ["1", "$100 USD por casilla. Pago total antes del 14 de septiembre de 2026."],
    ["2", "$300 USD por cada juego participante; tienes 17 oportunidades de ganar."],
    ["3", "Los números se sortean al inicio de temporada y permanecen ocultos hasta entonces."],
    ["4", "Cuenta el marcador final, incluidos tiempos extra, usando la unidad de cada equipo."],
  ];
  rules.forEach(([number,text],index)=>{const y=1632+index*54;ctx.fillStyle=gold;ctx.beginPath();ctx.arc(100,y-8,20,0,Math.PI*2);ctx.fill();ctx.fillStyle=navy;ctx.textAlign="center";ctx.font="900 22px Arial";ctx.fillText(number,100,y);ctx.fillStyle=white;ctx.textAlign="left";ctx.font="600 20px Arial";drawWrappedText(ctx,text,136,y,820,23);});
  ctx.fillStyle="#b8c7dc";ctx.textAlign="center";ctx.font="800 15px Arial";ctx.fillText("NO PAGADAS NO JUEGAN  •  SI GANA UNA NO VENDIDA, EL PREMIO QUEDA EN EL CLUB  •  SOLO JUEGOS LISTADOS",540,1842);
  roundedBox(ctx,70,1860,940,42,13,gold,null,0); ctx.fillStyle=navy; ctx.textAlign="center"; ctx.font="900 24px Arial"; ctx.fillText("¡PARTICIPA HOY Y APOYA PROYECTOS QUE CAMBIAN VIDAS!",540,1889);
  const blob = await new Promise<Blob>((resolve,reject)=>canvas.toBlob((value)=>value?resolve(value):reject(new Error("No se pudo crear la imagen")),"image/png"));
  return { blob, url:canvas.toDataURL("image/png") };
}

function roundedBox(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number,fill:string,stroke:string|null,width:number){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}}
function drawWrappedText(ctx:CanvasRenderingContext2D,text:string,x:number,y:number,maxWidth:number,lineHeight:number){const words=text.split(" ");let line="",lineY=y;for(const word of words){const test=`${line}${word} `;if(line&&ctx.measureText(test).width>maxWidth){ctx.fillText(line.trim(),x,lineY);line=`${word} `;lineY+=lineHeight;}else line=test;}if(line)ctx.fillText(line.trim(),x,lineY);}
function loadCanvasImage(src:string){return new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error("No se pudo cargar el logo"));image.src=src;});}
function downloadFlyer(blob:Blob){const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download="quiniela-mnf-2026.png";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

function isOwned(square:Square,me:Member){ return Boolean(square.reservedByEmail) && square.reservedByEmail.toLowerCase()===me.email.toLowerCase(); }
function labelFor(status:Status){ return status==="available"?"Disponible":status==="reserved"?"Reservada":"Pagada"; }
function roleLabel(role:Role){ return role==="admin"?"Administrador":role==="treasury"?"Tesorería":"Usuario"; }
function roleIcon(role:Role){ return role==="admin"?"A":role==="treasury"?"T":"U"; }
function roleHelp(role:Role){ return role==="admin"?"Puedes modificar cualquier dato, administrar accesos y configurar los números.":role==="treasury"?"Puedes reservar casillas y confirmar el pago de cualquier reservación.":"Puedes reservar casillas y confirmar el pago únicamente de las que tú vendiste."; }
function initials(name:string){ return name.split(/\s+/).filter(Boolean).slice(0,2).map((part)=>part[0]).join("").toUpperCase(); }
function cleanDigits(value:string){ return value.replace(/\D/g,"").slice(0,10); }
function isDigitSet(value:string){ return value.length===10&&new Set(value).size===10&&[...value].every((digit)=>"0123456789".includes(digit)); }
function activityIcon(action:string){ return action==="paid"?"$":action==="reserved"?"R":action==="released"?"↺":"·"; }
function activityText(item:Activity){ if(item.action==="paid")return `marcó como pagada la casilla ${item.squareId}`;if(item.action==="reserved")return `reservó la casilla ${item.squareId} para ${item.details}`;if(item.action==="released")return `liberó la casilla ${item.squareId}`;if(item.action==="member_updated")return `actualizó el acceso de ${item.details}`;if(item.action==="member_removed")return `retiró el acceso de ${item.details}`;if(item.action==="numbers_updated")return "actualizó los números de juego";return `actualizó la casilla ${item.squareId}`; }
function formatDate(value:string){ try{return new Intl.DateTimeFormat("es-MX",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}).format(new Date(value));}catch{return value;} }
