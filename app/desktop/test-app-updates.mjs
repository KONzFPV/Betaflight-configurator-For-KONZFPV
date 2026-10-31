import {test} from "node:test";import assert from "node:assert/strict";import {mkdtemp,rm,writeFile,readFile} from "node:fs/promises";import os from "node:os";import path from "node:path";
const {AppUpdates,validateRelease}=await import(process.env.KONZ_UPDATES_MODULE);
const manifest={build:10,version:"Preview10",tag:"konz-preview10",notes:"test",packages:[{kind:"portable",name:"KONz-Preview10.zip",bytes:3,sha256:"a".repeat(64)}]};
const response=data=>({status:200,body:Buffer.from(JSON.stringify(data)).toString("base64")});
test("one automatic reminder per build persists across checks, restarts, and ignored versions",async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),"konz-updates-"));
 try{let release={...manifest,build:11};let updates=new AppUpdates(dir,async()=>response(release));
 await updates.check();assert.equal(updates.state.notification,true);updates.acknowledge();
 await updates.check();assert.equal(updates.state.notification,false);
 updates=new AppUpdates(dir,async()=>response(release));await updates.check();assert.equal(updates.state.notification,false);
 release={...manifest,build:12,version:"Preview12"};await updates.check();assert.equal(updates.state.notification,true);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test("empty releases and CF failures are not reported as already current",async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),"konz-updates-"));
 try{const empty=new AppUpdates(dir,async()=>({status:204}));await empty.check();assert.equal(empty.state.status,"unpublished");
 const failed=new AppUpdates(dir,async()=>({status:404}));await failed.check();assert.equal(failed.state.status,"error");assert.equal(failed.state.notification,false);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test("downloading a release marked current remains an explicit user action",async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),"konz-update-current-"));const target=path.join(dir,"current.zip");
 try{const current={...manifest,build:9};const updates=new AppUpdates(dir,async job=>job.action==="update-download"?{saved:true}:{...response(current),routeId:2});
 await updates.check();assert.equal(updates.state.status,"current");let chosen=0;
 await assert.rejects(updates.download("portable",async()=>{chosen++;return target;}));assert.equal(chosen,0);
 updates.state.status="available";await updates.download("portable",async()=>target);
 assert.equal(await readFile(target,"utf8"),"abc");assert.equal(updates.state.usedRouteId,2);
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

test("current release downloads, native chooser cancellation, and separate persisted update route",async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),"konz-update-route-"));const jobs=[];
 try{
 const latest={...manifest,build:10,packages:[...manifest.packages,{kind:"installer",name:"KONz-Setup.exe",bytes:3,sha256:"b".repeat(64)}]};
 const request=async job=>{jobs.push(job);if(job.action==="update-download"){await writeFile(job.file,"abc");return {saved:true,routeId:3};}return {...response(latest),routeId:3};};
 const updates=new AppUpdates(dir,request);await updates.setRoute(3);await updates.check();
 assert.equal(updates.state.status,"current");assert.equal(jobs[0].routeId,3);
 await updates.download("portable",async()=>undefined);assert.equal(jobs.length,1);assert.equal(updates.state.downloading,false);
 const target=path.join(dir,"setup.exe");await updates.download("installer",async name=>{assert.equal(name,"KONz-Setup.exe");return target;});
 assert.equal(jobs.at(-1).routeId,3);assert.equal(await readFile(target,"utf8"),"abc");assert.equal(updates.state.usedRouteId,3);
 const restarted=new AppUpdates(dir,request);await restarted.check();assert.equal(restarted.state.routeId,3);
 await assert.rejects(updates.setRoute(4));await assert.rejects(updates.setRoute("1"));
 }finally{await rm(dir,{recursive:true,force:true});}
});
