import {execFileSync} from 'node:child_process';
export const compactChangedPaths=(from,to,{cwd}={})=>execFileSync('git',['diff','--no-renames','--name-only','-z',from,to],{cwd,encoding:'utf8'}).split('\0').filter(Boolean);
