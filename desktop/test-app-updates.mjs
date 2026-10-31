import {test} from "node:test";import assert from "node:assert/strict";import {mkdtemp,rm,writeFile,readFile} from "node:fs/promises";import os from "node:os";import path from "node:path";
const {AppUpdates,validateRelease}=await import(process.env.KONZ_UPDATES_MODULE);
const manifest={build:10,version:"Preview10",tag:"konz-preview10",notes:"test",packages:[{kind:"portable",name:"KONz-Preview10.zip",bytes:3,sha256:"a".repeat(64)}]};
const response=data=>({status:200,body:Buffer.from(JSON.stringify(data)).toString("base64")});
test("one automatic reminder per build persists across checks, restarts, and ignored versions",async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),"konz-updates-"));
 try{let release=manifest;let updates=new AppUpdates(dir,async()=>response(release));
 await updates.check();assert.equal(updates.state.notification,true);updates.acknowledge();
 await updates.check();assert.equal(updates.state.notification,false);
 updates=new AppUpdates(dir,async()=>response(release));await updates.check();assert.equal(updates.state.notification,false);
 release={...manifest,build:11,version:"Preview11"};await updates.check();assert.equal(updates.state.notification,true);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test("empty releases and CF failures are not reported as already current",async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),"konz-updates-"));
 try{const empty=new AppUpdates(dir,async()=>({status:204}));await empty.check();assert.equal(empty.state.status,"unpublished");
 const failed=new AppUpdates(dir,async()=>({status:404}));await failed.check();assert.equal(failed.state.status,"error");assert.equal(failed.state.notification,false);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test("malicious paths, duplicates, wrong extensions, sizes and checksum rejected",()=>{
 for(const bad of [{...manifest,tag:"../escape"},{...manifest,build:"10"},{...manifest,packages:[manifest.packages[0],manifest.packages[0]]},...["../x.zip","file.exe"].map(name=>({...manifest,packages:[{...manifest.packages[0],name}]})),{...manifest,packages:[{...manifest.packages[0],sha256:"invalid"}]}])assert.throws(()=>validateRelease(bad));
});
test("only published package kind may download, source is fixed CF route and verified temporary file moves to selected location",async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),"konz-updates-"));let downloads=0;
 const target=path.join(dir,"app.zip");
 try{const updates=new AppUpdates(dir,async job=>{
 if(job.action!=="update-download")return response(manifest);
 downloads++;assert.equal(job.path,"/updates/download/konz-preview10/KONz-Preview10.zip");assert.equal(job.sha256,"a".repeat(64));await writeFile(job.file,"abc");return {saved:true};
 });await updates.check();await assert.rejects(updates.download("installer",async()=>target));await updates.download("portable",async()=>target);assert.equal(downloads,1);assert.equal(await readFile(target,"utf8"),"abc");assert.equal(updates.state.savedPath,target);
 }finally{await rm(dir,{recursive:true,force:true});}
});
