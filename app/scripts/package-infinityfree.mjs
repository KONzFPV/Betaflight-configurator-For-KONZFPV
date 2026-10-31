import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const repo = path.resolve(import.meta.dirname, '..');
const output = path.resolve(process.argv[2] || path.join(repo, 'release'));
const web = path.join(output, 'htdocs');
const siteUrl = process.env.VITE_KONZ_WEB_URL || 'https://konzbf.cn';
if (!/^https:\/\/[a-z0-9.-]+$/i.test(siteUrl)) throw new Error('VITE_KONZ_WEB_URL must be a public HTTPS origin.');
if (fs.existsSync(web) && fs.readdirSync(web).length) throw new Error('Choose an empty output directory.');
fs.mkdirSync(web, {recursive:true});
fs.cpSync(path.join(repo, 'src/dist'), web, {recursive:true});
for (const name of ['build-api.php', 'deployment-check.html', '.htaccess']) {
    fs.copyFileSync(path.join(repo, 'server', name), path.join(web, name));
}
fs.copyFileSync(path.join(repo, 'LICENSE'), path.join(web, 'LICENSE.txt'));
fs.writeFileSync(path.join(web, 'BUILD-INFO.json'), JSON.stringify({
    name:'空致 KONz BF地面站', version:'2026.6.2-Preview10', siteUrl, builtAt:new Date().toISOString(),
    upstream:'https://github.com/betaflight/betaflight-configurator/tree/2026.6.2',
    buildRoute:'same-origin PHP -> https://build.betaflight.com',
    modifications:['dual OSD defaults','multiple receiver protocols','download compiled firmware toolbar button',
        'no automatic backup before flashing','53 Chinese mode names','26 Chinese build option labels','FPVFIX branding and plain home page','JavaScript chunks below 1 MB'],
}, null, 2));
const records=[];
function walk(directory) {
    for (const entry of fs.readdirSync(directory,{withFileTypes:true})) {
        const file=path.join(directory,entry.name);
        if(entry.isDirectory())walk(file);
        else {
            const bytes=fs.readFileSync(file);
            const limit=/\.(?:html|php|js)$/i.test(file)?1000000:10000000;
            if(bytes.length>limit)throw new Error('InfinityFree file-size limit exceeded: '+file);
            records.push({name:path.relative(output,file).split(path.sep).join('/'),bytes:bytes.length,
                sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
        }
    }
}
walk(web);
fs.writeFileSync(path.join(output,'files.sha256'),records.map(file=>file.sha256+'  '+file.name).join('\n')+'\n');
console.log(JSON.stringify({output,files:records.length,bytes:records.reduce((sum,file)=>sum+file.bytes,0),largestJavaScript:Math.max(...records.filter(file=>file.name.endsWith('.js')).map(file=>file.bytes))}));
