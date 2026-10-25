import {readFile} from 'node:fs/promises';
import {migrate,issueInvite} from './storage.mjs';
const root=process.env.LOVE_JOURNAL_STORAGE_DIR;
if(!root)throw Error('缺少 LOVE_JOURNAL_STORAGE_DIR');
if(process.argv[2]==='migrate') console.log(await migrate(root,JSON.parse(await readFile(process.argv[3],'utf8'))));
else if(process.argv[2]==='invite') process.stdout.write(await issueInvite(root, Number(process.env.INVITE_TTL_MINUTES ?? 15) * 60000));
else throw Error('用法: migrate <私有备份文件> 或 invite');
