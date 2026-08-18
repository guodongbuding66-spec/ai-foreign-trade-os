export async function onRequestGet(context){
  const bindings=['DB','KV','R2','AI_CREDENTIALS_MASTER_KEY','OPENAI_API_KEY','ANTHROPIC_API_KEY','GEMINI_API_KEY','DEEPSEEK_API_KEY','XAI_API_KEY','GROQ_API_KEY','TOGETHER_API_KEY','MISTRAL_API_KEY','OPENROUTER_API_KEY','AI_PROVIDER_CONFIG_JSON','APOLLO_API_KEY','HUNTER_API_KEY'];
  const available=bindings.reduce((acc,key)=>{acc[key]=Boolean(context.env?.[key]);return acc},{});
  return Response.json({mode:'development-baseline',bindings:available,warning:'Secrets are never returned. Only workspace binding presence is exposed. Personal BYOK credentials are encrypted in D1 and are not listed here.'},{headers:{'Cache-Control':'no-store'}});
}
