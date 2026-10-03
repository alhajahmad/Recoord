import {test} from 'node:test';import assert from 'node:assert/strict';import {readDeltas,boundedHistory} from '../lib/model.ts';
function stream(parts){return new ReadableStream({start(c){for(const p of parts)c.enqueue(new TextEncoder().encode(p));c.close()}})}
test('SSE parser handles fragmented lines and final event without newline',async()=>{let answer='';for await(const d of readDeltas(stream(['data: {"choices":[{"del','ta":{"content":"Hello"}}]}\n','data: {"choices":[{"delta":{"content":" world"}}]}\n','data: [DONE]'])))answer+=d;assert.equal(answer,'Hello world')});
test('truncated stream is an error, not a completed answer',async()=>{await assert.rejects(async()=>{for await(const _ of readDeltas(stream(['data: {"choices":[{"delta":{"content":"Partial"}}]}\n']))){}},/interrupted/)});
test('history cap keeps recent complete messages',()=>{assert.deepEqual(boundedHistory([{role:'user',content:'older long text'},{role:'user',content:'new'}],5),[{role:'user',content:'new'}])});
