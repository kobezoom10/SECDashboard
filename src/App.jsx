import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid, Legend
} from "recharts";


const ENDPOINTS = {
  enforcement: "/api/enforcement",
  litigation: "/api/litigation",
  admin: "/api/admin",
  aaer: "/api/aaer",
  courtlistener: "/api/courtlistener",
};

const DATE_FIELDS = {
  enforcement: "releasedAt",
  litigation: "releasedAt",
  admin: "releasedAt",
  aaer: "dateTime",
  courtlistener: "releasedAt",
};

const TODAY = new Date().toISOString().split("T")[0];

const C = {
  enforcement: "#e05c3a", litigation: "#4a9eff",
  admin: "#34c98d", aaer: "#f0a500", purple: "#b388ff",
  doj: "#ff4466",
};

const TAG_PRESETS = [
  "revenue recognition","insider trading","financial fraud","accounting violations",
  "disclosure fraud","FCPA","bribery","Ponzi scheme","market manipulation",
  "auditor independence","material weakness","restatement","cybersecurity",
];

async function secPost(endpoint, payload) {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    return await res.json();
  } catch (e) {
    console.error(e);
    return null;
  }
}

async function callClaude(system, user) {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    const d = await res.json();
    return d.content?.[0]?.text || "Analysis unavailable.";
  } catch { return "Analysis unavailable."; }
}

const fmtDate = d => d ? new Date(d).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : "—";
const fmtMoney = n => {
  if (!n || n === 0) return null;
  if (n >= 1e6) return `$${(n/1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n/1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
};
const trunc = (s, l=130) => s && s.length > l ? s.slice(0,l)+"…" : (s||"");

function Spinner() {
  return (
    <div style={{display:"flex",gap:6,alignItems:"center",justifyContent:"center",padding:"36px 0"}}>
      {[C.enforcement,C.litigation,C.admin].map((c,i)=>(
        <div key={i} style={{width:8,height:8,borderRadius:"50%",background:c,animation:`bounce 1.2s ease-in-out ${i*0.15}s infinite`}}/>
      ))}
    </div>
  );
}

function StatTile({label,value,sub,color,icon}){
  return (
    <div style={{flex:1,minWidth:130,background:"linear-gradient(135deg,#0f1117,#0a0d14)",border:`1px solid ${color}28`,borderRadius:14,padding:"18px 20px",position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",top:-8,right:-8,fontSize:44,opacity:0.06}}>{icon}</div>
      <div style={{fontSize:10,color:"#555",textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:8,fontFamily:"'DM Mono',monospace"}}>{label}</div>
      <div style={{fontSize:28,fontFamily:"'DM Mono',monospace",fontWeight:700,color,lineHeight:1}}>{value}</div>
      {sub&&<div style={{fontSize:11,color:"#444",marginTop:5}}>{sub}</div>}
    </div>
  );
}

function Badge({text,color}){
  return <span style={{fontSize:9,background:`${color}18`,border:`1px solid ${color}44`,color,padding:"2px 7px",borderRadius:4,textTransform:"uppercase",letterSpacing:"0.07em",fontFamily:"'DM Mono',monospace",whiteSpace:"nowrap"}}>{text}</span>;
}

function EnfCard({item,type,onAnalyze,activeAnalysis,analyzing}){
  const isActive = activeAnalysis?.id === item.id;
  const title = item.title || item.respondents?.map(r => r.name)?.join(", ") || "SEC Action";
  const dateField = item.releasedAt || item.dateTime;
  const totalPenalty = (() => {
    try {
      return (item.penaltyAmounts || []).filter(p => p != null).reduce((s, p) => {
        const amt = p.penaltyAmount;
        return s + (amt != null ? Number(amt) || 0 : 0);
      }, 0);
    } catch(e) { return 0; }
  })();
  const tags = item.tags?.slice(0,3)||[];
  return (
    <div style={{borderBottom:"1px solid #111624",padding:"16px 0",animation:"fadeSlide 0.3s ease"}}>
      <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:7,alignItems:"center"}}>
            <span style={{fontSize:11,color:"#555",fontFamily:"'DM Mono',monospace"}}>{fmtDate(dateField)}</span>
            {tags.map(t=><Badge key={t} text={t} color={C[type]}/>)}
            {item.hasAgreedToSettlement!==undefined&&<Badge text={item.hasAgreedToSettlement?"settled":"contested"} color={item.hasAgreedToSettlement?C.admin:C.enforcement}/>}
            {totalPenalty>0&&<span style={{fontSize:11,color:C.enforcement,fontFamily:"'DM Mono',monospace",fontWeight:700}}>{fmtMoney(totalPenalty)}</span>}
          </div>
      {(() => {
  const link = item.url || item.urls?.find(u => u.type === "Administrative Summary")?.url || item.urls?.[0]?.url || item.resources?.[0]?.url;
  return link ? (
    <a href={link} target="_blank" rel="noreferrer"
      style={{fontSize:13,color:"#ccd6f6",fontWeight:600,lineHeight:1.5,marginBottom:5,display:"block",textDecoration:"none",cursor:"pointer"}}
      onMouseEnter={e=>e.currentTarget.style.color="#4a9eff"}
      onMouseLeave={e=>e.currentTarget.style.color="#ccd6f6"}>
      {trunc(title,150)} <span style={{fontSize:10,color:"#334"}}>↗</span>
    </a>
  ) : (
    <div style={{fontSize:13,color:"#ccd6f6",fontWeight:600,lineHeight:1.5,marginBottom:5}}>{trunc(title,150)}</div>
  );
})()}
          {item.summary&&<div style={{fontSize:12,color:"#5a6a80",lineHeight:1.6}}>{trunc(item.summary,170)}</div>}
          {item.entities?.length>0&&(
            <div style={{marginTop:8,display:"flex",gap:6,flexWrap:"wrap"}}>
              {item.entities.slice(0,4).map((e,i)=>(
                <span key={i} style={{fontSize:11,background:"#0d1018",border:"1px solid #1a2030",color:"#6a7a9a",padding:"2px 8px",borderRadius:5}}>
                  {e.name}{e.ticker?` (${e.ticker})`:""}
                </span>
              ))}
            </div>
          )}
          {item.violatedSections?.length>0&&(
            <div style={{marginTop:7,fontSize:11,color:"#3a4a5a",lineHeight:1.6}}>
              {item.violatedSections.slice(0,2).map((s,i)=>(
                <span key={i} style={{display:"inline-block",marginRight:10}}>§ {trunc(s,65)}</span>
              ))}
            </div>
          )}
          {item.penaltyAmounts?.filter(p=>p && p.penaltyAmount && p.penaltyAmount>0).length>0&&(
            <div style={{marginTop:8,display:"flex",gap:7,flexWrap:"wrap"}}>
              {item.penaltyAmounts.filter(p=>p && p.penaltyAmount && p.penaltyAmount>0).slice(0,3).map((p,i)=>(
                <div key={i} style={{fontSize:11,background:"#180e0a",border:"1px solid #e05c3a22",color:"#b06840",padding:"3px 10px",borderRadius:5}}>
                  {fmtMoney(p.penaltyAmount)} → {trunc(p.imposedOn,35)}
                </div>
              ))}
            </div>
          )}
        </div>
        <button onClick={()=>onAnalyze(item,type)} disabled={analyzing}
          style={{flexShrink:0,fontSize:10,background:isActive?`${C.purple}22`:"transparent",border:`1px solid ${isActive?C.purple:"#1a2030"}`,color:isActive?C.purple:"#445",padding:"6px 11px",borderRadius:7,cursor:"pointer",transition:"all 0.2s",lineHeight:1.5,whiteSpace:"nowrap"}}>
          {analyzing&&activeAnalysis?.id===item.id?"…":isActive?"✦ Active":"AI\nAnalyze"}
        </button>
      </div>
      {isActive&&(
        <div style={{marginTop:14,background:"#060910",border:`1px solid ${C.purple}33`,borderRadius:10,padding:16,animation:"fadeSlide 0.25s ease"}}>
          <div style={{fontSize:10,color:C.purple,letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:"'DM Mono',monospace",marginBottom:10}}>✦ AI Enforcement Analysis</div>
          <div style={{fontSize:13,color:"#aac0e0",lineHeight:1.85,whiteSpace:"pre-wrap"}}>{activeAnalysis.text}</div>
        </div>
      )}
    </div>
  );
}

export default function SECIntel() {
  const [tab, setTab] = useState("feed");
  const [feedType, setFeedType] = useState("enforcement");
  const [items, setItems] = useState([]);
  const [tagsByYear, setTagsByYear] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [dateFrom, setDateFrom] = useState("1997-01-01");
  const [dateTo, setDateTo] = useState(TODAY);
  const [searchText, setSearchText] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [trendData, setTrendData] = useState([]);
  const [tagBreakdown, setTagBreakdown] = useState([]);
  const [loadingTrend, setLoadingTrend] = useState(false);
  const [trendInsight, setTrendInsight] = useState("");
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [statsMap, setStatsMap] = useState({});

  const fetchFeed = useCallback(async (type, query, pg) => {
    setLoading(true);
    setItems([]);
    const ep = ENDPOINTS[type];
    const dateField = DATE_FIELDS[type] || "releasedAt";
    const q = query
  ? `(title:${query} OR summary:${query} OR tags:${query} OR complaints:${query}) AND ${dateField}:[${dateFrom} TO ${dateTo}]`
  : `${dateField}:[${dateFrom} TO ${dateTo}]`;
    const result = await secPost(ep, {
      query: q,
      from: pg * 20,
      size: 20,
      sort: [{ [dateField]: { order: "desc" } }],
    });
    if (result?.data) {
      setItems(result.data);
      setTotal(result.total?.value || result.data.length);
    } else {
      setItems([]);
      setTotal(0);
    }
    setLoading(false);
  }, [dateFrom, dateTo]);

  useEffect(() => { fetchFeed(feedType, activeQuery, page); }, [feedType, activeQuery, page, fetchFeed]);

  useEffect(() => {
    const load = async () => {
      const q = `releasedAt:[2024-01-01 TO ${TODAY}]`;
      const [enf,lit,adm] = await Promise.all([
        secPost(ENDPOINTS.enforcement,{query:q,size:1}),
        secPost(ENDPOINTS.litigation, {query:q,size:1}),
        secPost(ENDPOINTS.admin,      {query:q,size:1}),
      ]);
      setStatsMap({
        enforcement: enf?.total?.value??"—",
        litigation:  lit?.total?.value??"—",
        admin:       adm?.total?.value??"—",
      });
    };
    load();
  }, []);

  const loadTrends = async () => {
    setLoadingTrend(true);
    const years = [2000,2005,2010,2015,2018,2019,2020,2021,2022,2023,2024,2025];
    const rows = [];
    for (const yr of years) {
      const q = `releasedAt:[${yr}-01-01 TO ${yr}-12-31]`;
      const [enf,lit,adm] = await Promise.all([
        secPost(ENDPOINTS.enforcement,{query:q,size:1}),
        secPost(ENDPOINTS.litigation, {query:q,size:1}),
        secPost(ENDPOINTS.admin,      {query:q,size:1}),
      ]);
      rows.push({year:String(yr),enforcement:enf?.total?.value||0,litigation:lit?.total?.value||0,admin:adm?.total?.value||0});
      await new Promise(r => setTimeout(r, 300));
    }
    setTrendData(rows);
    await new Promise(r => setTimeout(r, 500));
    const tagRes = await secPost(ENDPOINTS.enforcement,{query:`releasedAt:[2020-01-01 TO ${TODAY}]`,size:50});
    if (tagRes?.data) {
      const counts={};
      tagRes.data.forEach(i=>(i.tags||[]).forEach(t=>{counts[t]=(counts[t]||0)+1}));
      const palette = ["#e05c3a","#4a9eff","#34c98d","#f0a500","#b388ff","#ff6b9d","#00d4aa","#ffd700","#ff6b35","#00b4d8","#90e0ef","#c77dff","#80ffdb","#ffb703","#fb8500"];
      setTagBreakdown(Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,7).map(([name,value],i)=>({name,value,color:palette[i]})));
    }
    const tagYears = [2015, 2017, 2019, 2021, 2023, 2025];
const tagYearData = [];
for (const yr of tagYears) {
  await new Promise(r => setTimeout(r, 400));
  const res = await secPost(ENDPOINTS.enforcement, {
    query: `releasedAt:[${yr}-01-01 TO ${yr}-12-31]`,
    size: 50
  });
  if (res?.data) {
    const counts = {};
    res.data.forEach(i => (i.tags||[]).forEach(t => { counts[t] = (counts[t]||0)+1; }));
    const top5 = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,5);
    tagYearData.push({ year: String(yr), ...Object.fromEntries(top5) });
  }
}
setTagsByYear(tagYearData);
    setLoadingTrend(false);
  };

  const handleAnalyze = async (item, type) => {
    if (analysis?.id===item.id){setAnalysis(null);return;}
    setAnalyzing(true);
    const penalties=item.penaltyAmounts?.filter(p=>p&&p.penaltyAmount).map(p=>`${fmtMoney(p.penaltyAmount)} on ${p.imposedOn}`).join("; ")||"not specified";
    const text = await callClaude(
      "You are a senior SEC enforcement analyst and CPA with 20+ years of experience. Your analyses are concise, technically precise, and actionable for accounting and compliance professionals.",
      `SEC ${type.toUpperCase()} Action:
Title: ${item.title||"N/A"}
Date: ${fmtDate(item.releasedAt||item.dateTime)}
Entities: ${item.entities?.map(e=>e.name).join(", ")||"N/A"}
Tags: ${item.tags?.join(", ")||"N/A"}
Summary: ${item.summary||"N/A"}
Penalties: ${penalties}
Violated Sections: ${item.violatedSections?.join("; ")||"N/A"}
Complaints: ${item.complaints?.slice(0,2).join(" | ")||"N/A"}
Relief: ${item.requestedRelief?.join(", ")||"N/A"}
Settled: ${item.hasAgreedToSettlement??"unknown"}

Provide 4-5 sentences covering: (1) the core accounting/securities violation, (2) what makes this notable or precedent-setting, (3) practical implications for CPAs, auditors, or compliance officers, and (4) whether this fits a recognizable enforcement pattern.`
    );
    setAnalysis({id:item.id,text});
    setAnalyzing(false);
  };

  const handleTrendInsight = async () => {
    setLoadingInsight(true);
    const rows=trendData.map(r=>`${r.year}: enforcement=${r.enforcement}, litigation=${r.litigation}, admin=${r.admin}`).join("\n");
    const tags=tagBreakdown.map(t=>`${t.name}:${t.value}`).join(", ");
    const text = await callClaude(
      "You are an expert SEC enforcement analyst and accounting thought leader. Provide sharp, data-driven insights for CPAs, audit partners, and CFOs.",
      `Real live data from sec-api.io:\n\nAnnual counts:\n${rows}\n\nTop violation tags (2020–present): ${tags}\n\n1. What are the 3 most significant enforcement trends in this data?\n2. What should accounting professionals watch for in 2025–2026?\n3. Any patterns in settlement vs. litigation?\n\nKeep to 6-7 sentences. Be specific and cite numbers.`
    );
    setTrendInsight(text);
    setLoadingInsight(false);
  };
const exportToExcel = async () => {
  setExporting(true);
  const ep = ENDPOINTS[feedType];
  const dateField = DATE_FIELDS[feedType] || "releasedAt";
  const q = activeQuery
    ? `(title:${activeQuery} OR summary:${activeQuery} OR tags:${activeQuery} OR complaints:${activeQuery}) AND ${dateField}:[${dateFrom} TO ${dateTo}]`
    : `${dateField}:[${dateFrom} TO ${dateTo}]`;

  let allItems = [];
  let page = 0;
  const pageSize = 50;

  while (true) {
    const result = await secPost(ep, {
      query: q,
      from: page * pageSize,
      size: pageSize,
      sort: [{ [dateField]: { order: "desc" } }],
    });
    if (!result?.data || result.data.length === 0) break;
    allItems = [...allItems, ...result.data];
    if (allItems.length >= result.total?.value || allItems.length >= 10000) break;
    page++;
    await new Promise(r => setTimeout(r, 300));
  }

  const rows = allItems.map(item => ({
    "Date": fmtDate(item.releasedAt || item.dateTime),
    "Title": item.title || item.respondents?.map(r=>r.name)?.join(", ") || "SEC Action",
    "Tags": item.tags?.join(", ") || "",
    "Settlement": item.hasAgreedToSettlement === true ? "Settled" : item.hasAgreedToSettlement === false ? "Contested" : "",
    "Total Penalty": item.penaltyAmounts?.filter(p=>p&&p.penaltyAmount).reduce((s,p)=>s+(Number(p.penaltyAmount)||0),0) || "",
    "Entities": item.entities?.map(e=>e.name).join(", ") || "",
    "Violated Sections": item.violatedSections?.join("; ") || "",
    "Summary": item.summary || "",
    "URL": item.url || item.urls?.[0]?.url || "",
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "SEC Enforcement");
  XLSX.writeFile(wb, `SEC_${feedType}_${TODAY}.xlsx`);
  setExporting(false);
};

  const feedTypes=[
    {id:"enforcement",label:"Enforcement Actions",color:C.enforcement,icon:"⚖"},
    {id:"litigation", label:"Litigation Releases",color:C.litigation, icon:"⚡"},
    {id:"admin",      label:"Admin Proceedings",  color:C.admin,      icon:"📋"},
    {id:"aaer",       label:"AAERs",              color:C.aaer,       icon:"🔎"},
    {id:"courtlistener", label:"Federal Cases",   color:C.doj,        icon:"🏛"},
  ];

  return (
    <div style={{background:"#070a10",minHeight:"100vh",color:"#ccd6f6",fontFamily:"'Syne','DM Sans',sans-serif"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap');
        @keyframes fadeSlide{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes bounce{0%,100%{transform:scale(0.7);opacity:0.4}50%{transform:scale(1.2);opacity:1}}
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#070a10}::-webkit-scrollbar-thumb{background:#1a2030;border-radius:2px}
        input,button{font-family:inherit;outline:none}
      `}</style>

      {/* NAV */}
      <nav style={{borderBottom:"1px solid #0f1420",padding:"0 28px",height:56,display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,background:"#070a10",zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div style={{display:"flex",alignItems:"center",gap:9}}>
            <div style={{width:26,height:26,background:"linear-gradient(135deg,#e05c3a,#b33020)",borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13}}>⚖</div>
            <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:17,letterSpacing:"-0.02em"}}>SEC<span style={{color:"#e05c3a"}}>intel</span></span>
          </div>
          <span style={{fontSize:10,background:"#0f1420",border:"1px solid #1a2030",color:"#445",padding:"3px 10px",borderRadius:20,letterSpacing:"0.07em",textTransform:"uppercase"}}>Enforcement Monitor</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:7,height:7,borderRadius:"50%",background:"#34c98d",boxShadow:"0 0 8px #34c98d"}}/>
          <span style={{fontSize:11,color:"#34c98d",fontFamily:"'DM Mono',monospace"}}>sec-api.io · Live</span>
        </div>
      </nav>

      <div style={{maxWidth:1100,margin:"0 auto",padding:"24px 28px"}}>

        {/* STATS */}
        <div style={{display:"flex",gap:10,marginBottom:24,flexWrap:"wrap"}}>
          <StatTile label="Enforcement 2024–25" value={statsMap.enforcement??"…"} sub="Actions filed" color={C.enforcement} icon="⚖"/>
          <StatTile label="Litigation 2024–25"  value={statsMap.litigation??"…"}  sub="Releases"     color={C.litigation}  icon="⚡"/>
          <StatTile label="Admin 2024–25"        value={statsMap.admin??"…"}        sub="Proceedings"  color={C.admin}       icon="📋"/>
          <StatTile label="AI Engine"            value="Claude"                     sub="Sonnet · Live" color={C.purple}     icon="✦"/>
        </div>

        {/* TABS */}
        <div style={{display:"flex",gap:2,borderBottom:"1px solid #0f1420",marginBottom:22}}>
          {[["feed","Live Feed"],["trends","Trend Analysis"],["search","Deep Search"]].map(([id,label])=>(
            <button key={id} onClick={()=>setTab(id)}
              style={{background:"none",border:"none",borderBottom:tab===id?"2px solid #e05c3a":"2px solid transparent",color:tab===id?"#fff":"#445",padding:"11px 18px",cursor:"pointer",fontSize:13,fontWeight:tab===id?600:400,transition:"all 0.2s",marginBottom:-1}}>
              {label}
            </button>
          ))}
        </div>

        {/* ── FEED ── */}
        {tab==="feed"&&(
          <div style={{display:"grid",gridTemplateColumns:"190px 1fr",gap:20}}>
            <div>
              {feedTypes.map(ft=>(
                <button key={ft.id} onClick={()=>{setFeedType(ft.id);setPage(0);setAnalysis(null);}}
                  style={{display:"block",width:"100%",background:feedType===ft.id?`${ft.color}12`:"transparent",border:`1px solid ${feedType===ft.id?ft.color+"55":"#0f1420"}`,borderRadius:9,padding:"11px 14px",cursor:"pointer",textAlign:"left",marginBottom:6,transition:"all 0.2s"}}>
                  <div style={{fontSize:17,marginBottom:2}}>{ft.icon}</div>
                  <div style={{fontSize:12,color:feedType===ft.id?ft.color:"#445",fontWeight:feedType===ft.id?600:400}}>{ft.label}</div>
                </button>
              ))}
              <div style={{marginTop:14,padding:14,background:"#0a0d14",border:"1px solid #0f1420",borderRadius:9}}>
                <div style={{fontSize:10,color:"#333",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8,fontFamily:"'DM Mono',monospace"}}>Quick Topics</div>
                {TAG_PRESETS.map(t=>(
                  <div key={t} onClick={()=>{setActiveQuery(t);setPage(0);}}
                    style={{fontSize:11,color:activeQuery===t?"#e05c3a":"#3a4a5a",padding:"4px 0",cursor:"pointer",transition:"color 0.15s",borderBottom:"1px solid #0a0d14"}}>
                    {t}
                  </div>
                ))}
                {activeQuery&&<div onClick={()=>setActiveQuery("")} style={{fontSize:10,color:"#4a9eff",marginTop:8,cursor:"pointer"}}>✕ Clear</div>}
              </div>
            </div>

            <div>
              <div style={{display:"flex",gap:8,marginBottom:14,alignItems:"center",flexWrap:"wrap"}}>
                <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
                  style={{background:"#0f1117",border:"1px solid #1a2030",borderRadius:7,padding:"7px 11px",color:"#aac0e0",fontSize:12,fontFamily:"'DM Mono',monospace"}}/>
                <span style={{color:"#333",fontSize:12}}>→</span>
                <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
                  style={{background:"#0f1117",border:"1px solid #1a2030",borderRadius:7,padding:"7px 11px",color:"#aac0e0",fontSize:12,fontFamily:"'DM Mono',monospace"}}/>
                <input value={searchText} onChange={e=>setSearchText(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&(setActiveQuery(searchText),setPage(0))}
                  placeholder="Search filings…"
                  style={{flex:1,minWidth:160,background:"#0f1117",border:"1px solid #1a2030",borderRadius:7,padding:"7px 12px",color:"#ccd6f6",fontSize:12}}/>
                <button onClick={()=>{setActiveQuery(searchText);setPage(0);}}
                  style={{background:"#e05c3a",border:"none",borderRadius:7,padding:"8px 16px",color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>
                  Search
                </button>
                <button onClick={()=>{setActiveQuery(searchText);setPage(0);}}
  style={{background:"#e05c3a",border:"none",borderRadius:7,padding:"8px 16px",color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>
  Search
</button>
<button onClick={exportToExcel} disabled={items.length === 0 || exporting}
  style={{background:"#0f1117",border:"1px solid #1a2030",borderRadius:7,padding:"8px 16px",color:items.length===0?"#333":"#ccd6f6",fontSize:12,fontWeight:600,cursor:items.length===0?"default":"pointer"}}>
  {exporting ? "Exporting…" : "↓ Export All"}
</button>
              </div>

              <div style={{fontSize:12,color:"#334",marginBottom:12,fontFamily:"'DM Mono',monospace"}}>
                {loading?"Fetching from sec-api.io…":(
                  <span><span style={{color:C[feedType]}}>{total.toLocaleString()}</span> results{activeQuery&&<span style={{color:"#4a9eff"}}> · "{activeQuery}"</span>}</span>
                )}
              </div>

              {loading?<Spinner/>:(
                <div>
                  {items.length===0&&<div style={{textAlign:"center",color:"#1a2030",padding:"48px 0",fontSize:13}}>No results — adjust date range or search terms.</div>}
                  {items.map((item,i)=>(
                    <EnfCard key={item.id||i} item={item} type={feedType} onAnalyze={handleAnalyze} activeAnalysis={analysis} analyzing={analyzing}/>
                  ))}
                  {total>20&&(
                    <div style={{display:"flex",gap:10,justifyContent:"center",marginTop:24,alignItems:"center"}}>
                      <button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0}
                        style={{background:"#0f1117",border:"1px solid #1a2030",borderRadius:7,padding:"7px 16px",color:page===0?"#222":"#ccd6f6",cursor:page===0?"default":"pointer",fontSize:12}}>
                        ← Prev
                      </button>
                      <span style={{fontSize:12,color:"#334",fontFamily:"'DM Mono',monospace"}}>{page+1} / {Math.ceil(total/20)}</span>
                      <button onClick={()=>setPage(p=>p+1)} disabled={(page+1)*20>=total}
                        style={{background:"#0f1117",border:"1px solid #1a2030",borderRadius:7,padding:"7px 16px",color:(page+1)*20>=total?"#222":"#ccd6f6",cursor:(page+1)*20>=total?"default":"pointer",fontSize:12}}>
                        Next →
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TRENDS ── */}
        {tab==="trends"&&(
          <div style={{animation:"fadeSlide 0.3s ease"}}>
            {trendData.length===0&&!loadingTrend&&(
              <div style={{textAlign:"center",padding:"40px 0"}}>
                <button onClick={loadTrends}
                  style={{background:C.enforcement,border:"none",borderRadius:9,padding:"13px 30px",color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer"}}>
                  Load Live Trend Data
                </button>
                <div style={{fontSize:12,color:"#334",marginTop:10}}>Queries 2000–2024 across all sec-api.io enforcement databases</div>
              </div>
            )}
            {loadingTrend&&<Spinner/>}
            {trendData.length>0&&(
              <>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18,marginBottom:18}}>
                  <div style={{background:"#0f1117",border:"1px solid #0f1420",borderRadius:13,padding:20}}>
                    <div style={{fontSize:11,color:"#445",textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:16,fontFamily:"'DM Mono',monospace"}}>Annual Volume · Live Data</div>
                    <ResponsiveContainer width="100%" height={210}>
                      <LineChart data={trendData}>
                        <CartesianGrid stroke="#0d1018" strokeDasharray="3 3"/>
                        <XAxis dataKey="year" tick={{fill:"#445",fontSize:11}} axisLine={false} tickLine={false} interval={0}/>
                        <YAxis tick={{fill:"#445",fontSize:11}} axisLine={false} tickLine={false}/>
                        <Tooltip contentStyle={{background:"#0a0d14",border:"1px solid #1a2030",borderRadius:8,fontSize:12,color:"#ccd6f6"}}/>
                        <Line type="monotone" dataKey="enforcement" stroke={C.enforcement} strokeWidth={2} dot={{r:4,fill:C.enforcement}} name="Enforcement"/>
                        <Line type="monotone" dataKey="litigation"  stroke={C.litigation}  strokeWidth={2} dot={{r:4,fill:C.litigation}}  name="Litigation"/>
                        <Line type="monotone" dataKey="admin"       stroke={C.admin}       strokeWidth={2} dot={{r:4,fill:C.admin}}       name="Admin"/>
                      </LineChart>
                    </ResponsiveContainer>
                    <div style={{display:"flex",gap:16,marginTop:8}}>
                      {[["enforcement","Enforcement"],["litigation","Litigation"],["admin","Admin"]].map(([k,l])=>(
                        <div key={k} style={{display:"flex",alignItems:"center",gap:5}}>
                          <div style={{width:14,height:2,background:C[k]}}/>
                          <span style={{fontSize:10,color:"#445"}}>{l}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{background:"#0f1117",border:"1px solid #0f1420",borderRadius:13,padding:20}}>
                    <div style={{fontSize:11,color:"#445",textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:16,fontFamily:"'DM Mono',monospace"}}>Top Violation Tags · 2020–Present</div>
                    {tagBreakdown.length>0?(
                      <div style={{display:"flex",alignItems:"center",gap:16}}>
                        <ResponsiveContainer width={155} height={155}>
                          <PieChart>
                            <Pie data={tagBreakdown} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" paddingAngle={3}>
                              {tagBreakdown.map((e,i)=><Cell key={i} fill={e.color}/>)}
                            </Pie>
                            <Tooltip
                              contentStyle={{background:"#0a0d14",border:"1px solid #1a2030",borderRadius:8,fontSize:12,color:"#ccd6f6"}}
                              itemStyle={{color:"#ccd6f6"}}
                              labelStyle={{color:"#ccd6f6"}}
                              formatter={(value, name) => [value, name]}
                              />
                          </PieChart>
                        </ResponsiveContainer>
                        <div style={{flex:1}}>
                          {tagBreakdown.map(t=>(
                            <div key={t.name} style={{display:"flex",alignItems:"center",gap:7,marginBottom:7}}>
                              <div style={{width:8,height:8,background:t.color,borderRadius:"50%",flexShrink:0}}/>
                              <span style={{fontSize:11,color:"#667",flex:1,textTransform:"capitalize"}}>{t.name}</span>
                              <span style={{fontSize:11,color:t.color,fontFamily:"'DM Mono',monospace"}}>{t.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ):<div style={{color:"#222",fontSize:12,textAlign:"center",paddingTop:40}}>No tag data</div>}
                  </div>
                </div>

               <div style={{background:"#0f1117",border:"1px solid #0f1420",borderRadius:13,padding:20,marginBottom:18}}>
  <div style={{fontSize:11,color:"#445",textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:16,fontFamily:"'DM Mono',monospace"}}>Top Enforcement Tags by Year</div>
  {tagsByYear.length>0?(()=>{
    const allTags = [...new Set(tagsByYear.flatMap(yr => Object.keys(yr).filter(k => k !== "year")))];
    const palette = [C.enforcement,C.litigation,C.admin,C.aaer,C.purple,"#ff6b9d","#00d4aa","#ffd700"];
    return (
      <ResponsiveContainer width="100%" height={280}>
      <BarChart data={tagsByYear} barGap={2} barCategoryGap="5%">
  <CartesianGrid stroke="#0d1018" strokeDasharray="3 3"/>
  <XAxis dataKey="year" tick={{fill:"#445",fontSize:11}} axisLine={false} tickLine={false}/>
  <YAxis tick={{fill:"#445",fontSize:11}} axisLine={false} tickLine={false}/>
  <Legend wrapperStyle={{fontSize:11,color:"#667",paddingTop:12}}/>
  <Tooltip
    contentStyle={{background:"#0a0d14",border:"1px solid #1a2030",borderRadius:8,fontSize:12,color:"#ccd6f6"}}
    itemStyle={{color:"#ccd6f6"}}
  />
  {allTags.map((tag,i) => (
    <Bar key={tag} dataKey={tag} fill={palette[i%palette.length]} name={tag} radius={[3,3,0,0]}/>
  ))}
</BarChart>
      </ResponsiveContainer>
    );
  })():<div style={{color:"#334",fontSize:12,textAlign:"center",paddingTop:40}}>Load trend data to see tag breakdown</div>}
</div>

                <div style={{background:"#060910",border:`1px solid ${C.purple}33`,borderRadius:13,padding:22}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                    <div style={{fontSize:11,color:C.purple,letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:"'DM Mono',monospace"}}>✦ AI Trend Intelligence · Live Data</div>
                    <button onClick={handleTrendInsight} disabled={loadingInsight}
                      style={{background:`${C.purple}18`,border:`1px solid ${C.purple}44`,borderRadius:8,padding:"7px 18px",color:C.purple,fontSize:11,cursor:"pointer",fontWeight:600}}>
                      {loadingInsight?"Analyzing…":"Generate Insight"}
                    </button>
                  </div>
                  {loadingInsight&&<Spinner/>}
                  {trendInsight&&!loadingInsight&&<div style={{fontSize:13,color:"#aac0e0",lineHeight:1.85,animation:"fadeSlide 0.3s ease"}}>{trendInsight}</div>}
                  {!trendInsight&&!loadingInsight&&<div style={{fontSize:13,color:"#1a2030",fontStyle:"italic"}}>Click "Generate Insight" for Claude's analysis of the live trend data above.</div>}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── SEARCH ── */}
        {tab==="search"&&(
          <div style={{animation:"fadeSlide 0.3s ease"}}>
            <div style={{background:"#0f1117",border:"1px solid #0f1420",borderRadius:13,padding:24,marginBottom:18}}>
              <div style={{fontSize:15,fontWeight:700,color:"#fff",marginBottom:6,fontFamily:"'Syne',sans-serif"}}>Lucene-Powered Search</div>
              <div style={{fontSize:12,color:"#445",marginBottom:20,lineHeight:1.7}}>
                Full Lucene syntax via sec-api.io. Boolean operators (AND, OR, NOT), field queries, and date ranges all supported. Results appear in the Live Feed tab.
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                {[
                  ["Revenue Recognition","revenue recognition"],["Material Weakness","material weakness"],
                  ["Auditor Independence","auditor independence"],["Insider Trading","insider trading"],
                  ["FCPA / Bribery","FCPA OR bribery"],["Cybersecurity","cybersecurity"],
                  ["Ponzi Scheme","Ponzi scheme"],["Accounting Violations","accounting violations"],
                  ["Restatement","restatement"],
                ].map(([label,q])=>(
                  <button key={label} onClick={()=>{setActiveQuery(q);setTab("feed");setPage(0);}}
                    style={{background:"#0a0d14",border:"1px solid #0f1420",borderRadius:8,padding:"12px 14px",color:"#6a7a9a",fontSize:12,cursor:"pointer",textAlign:"left",transition:"all 0.2s"}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor=C.litigation;e.currentTarget.style.color=C.litigation;}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor="#0f1420";e.currentTarget.style.color="#6a7a9a";}}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{background:"#0f1117",border:"1px solid #0f1420",borderRadius:13,padding:24}}>
              <div style={{fontSize:11,color:"#445",textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:16,fontFamily:"'DM Mono',monospace"}}>External Research Databases</div>
              {[
                {label:"SEED Database (NYU / Cornerstone)",desc:"All SEC enforcement against public companies since 1978",url:"https://seed.law.nyu.edu",color:C.enforcement},
                {label:"Stanford FCPA Clearinghouse",desc:"Every FCPA enforcement action since enactment — with analytics",url:"https://fcpa.stanford.edu",color:C.litigation},
                {label:"SEC Litigation Releases",desc:"Official civil lawsuits & enforcement releases",url:"https://www.sec.gov/litigation/litreleases",color:C.admin},
                {label:"SEC AAERs (Official)",desc:"Accounting & Auditing Enforcement Releases 1997–present",url:"https://www.sec.gov/litigation/aaers",color:C.aaer},
                {label:"SEC Rule Proposals",desc:"Current, proposed, and final rulemakings",url:"https://www.sec.gov/rules/proposed.shtml",color:C.purple},
                {label:"SEC Speeches & Remarks",desc:"Commissioner speeches and regulatory thought leadership",url:"https://www.sec.gov/news/speeches",color:"#ff6b9d"},
                {label:"Cornerstone Research Reports",desc:"Annual SEC enforcement analytics with penalty trend data",url:"https://www.cornerstone.com/publications/?topic=securities-enforcement",color:C.enforcement},
              ].map(r=>(
                <a key={r.label} href={r.url} target="_blank" rel="noreferrer"
                  style={{display:"flex",alignItems:"center",gap:14,padding:"13px 0",borderBottom:"1px solid #0a0d14",textDecoration:"none"}}>
                  <div style={{width:3,height:30,background:r.color,borderRadius:2,flexShrink:0}}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,color:"#bbc8e0",fontWeight:500}}>{r.label}</div>
                    <div style={{fontSize:11,color:"#334",marginTop:2}}>{r.desc}</div>
                  </div>
                  <span style={{color:"#2a3040",fontSize:14}}>↗</span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
