import assert from 'node:assert/strict';
import { extractWebSources, openAIStatus, outputText, parseStructuredOutput } from '../functions/_lib/openai.js';

const response={output:[
  {type:'web_search_call',action:{sources:[{url:'https://example.com/a',title:'A source'},{url:'https://example.com/a',title:'duplicate'}]}},
  {type:'message',content:[{type:'output_text',text:'{"summary":"ok"}',annotations:[{type:'url_citation',url_citation:{url:'https://example.com/b',title:'B source'}}]}]}
]};
assert.equal(outputText(response),'{"summary":"ok"}');
assert.deepEqual(parseStructuredOutput(response),{summary:'ok'});
assert.deepEqual(extractWebSources(response),[
  {url:'https://example.com/a',title:'A source'},
  {url:'https://example.com/b',title:'B source'}
]);
assert.deepEqual(openAIStatus({}),{configured:false,researchModel:'gpt-5.6-terra',draftModel:'gpt-5.6-luna'});
assert.equal(openAIStatus({OPENAI_API_KEY:'secret',OPENAI_MODEL:'gpt-test'}).configured,true);
console.log('OpenAI adapter smoke OK');
