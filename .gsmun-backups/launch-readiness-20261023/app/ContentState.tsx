export function ContentState({ children }: { children: React.ReactNode }) {
  return <main style={{position:"fixed",inset:0,background:"#031b0e",color:"#f2ecd8",display:"grid",placeContent:"center",padding:24,textAlign:"center"}}>
    <img src="/identity/gsmun-2026-digital-archive.png" alt="GSMUN 2026 Digital Archive" width={260} height={120} style={{margin:"0 auto 24px",objectFit:"contain"}} />
    {children}
  </main>;
}
