import type {ActionFunctionArgs} from "react-router";
import {authenticate, sessionStorage} from "../shopify.server";

export const action = async ({request}: ActionFunctionArgs) => {
  const {admin, payload, session} = await authenticate.webhook(request);
  console.log(`Received APP_SCOPES_UPDATE webhook for ${payload.shop_domain}`);
  if (session && admin) {
    session.scope = payload.current.toString();
    await sessionStorage.storeSession(session);
  }
  return new Response();
};
