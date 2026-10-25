export async function register(){
  if(process.env.NEXT_RUNTIME==="nodejs" && process.env.GSMUN_OFFLINE_VERIFY!=="1" && process.env.GSMUN_DRIVE_ENABLED==="1"){
    const {startDrivePoller}=await import("./lib/cms/drive-worker");startDrivePoller();
  }
}
