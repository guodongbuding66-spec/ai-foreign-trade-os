import { assertSameOrigin, json, requireAuth } from '../_lib/auth.js';
import { cargoBody, cargoError, validateCargoReferences } from '../_lib/cargo.js';
import { onRequestPost as saveLoadPlan } from './load-plans/index.js';

export async function onRequestPost(context) {
  const origin = assertSameOrigin(context.request);
  if (origin) return origin;
  const {response, auth} = await requireAuth(context, 'container.write');
  if (response) return response;
  try {
    const body = await cargoBody(context.request);
    await validateCargoReferences(context.env.DB, auth.tenant.id, body);
    return saveLoadPlan({...context, request: new Request(context.request.url, {
      method: 'POST', headers: context.request.headers, body: JSON.stringify(body)
    })});
  } catch (error) { return cargoError(error); }
}
