// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { test, expect } from 'vitest';

test('Docker startup uses only default profile credentials and clears competing session/bearer tokens without printing secrets', () => {
    const output = execFileSync('python3', ['-c', `
import json, os, runpy, subprocess
from unittest.mock import patch
calls=[]
def run(command, **options):
    calls.append(command)
    if command[:3]==['aws','configure','export-credentials']:
        assert command[3:]==['--profile','default','--format','process']
        return subprocess.CompletedProcess(command,0,stdout=json.dumps({'AccessKeyId':'FAKE-KEY','SecretAccessKey':'FAKE-SECRET'}))
    if command[:3]==['aws','configure','get']:
        return subprocess.CompletedProcess(command,0,stdout='ap-northeast-2\\n')
    assert command==['docker','compose','up','-d','--build']
    env=options['env']
    assert env['AWS_ACCESS_KEY_ID']=='FAKE-KEY' and env['AWS_SECRET_ACCESS_KEY']=='FAKE-SECRET'
    assert env['AWS_SESSION_TOKEN']=='' and 'AWS_BEARER_TOKEN_BEDROCK' not in env
    assert env['AWS_REGION']=='ap-northeast-2'
    assert str(options['cwd'])==os.getcwd()
    return subprocess.CompletedProcess(command,0)
with patch.dict(os.environ,{'AWS_SESSION_TOKEN':'old-session','AWS_BEARER_TOKEN_BEDROCK':'old-bearer'}), patch('subprocess.run',side_effect=run):
    runpy.run_path('development/tools/start-docker-with-default-aws.py',run_name='__main__')
assert len(calls)==3
print('verified')
`], { encoding: 'utf8' });
    expect(output.trim()).toBe('verified');
});
