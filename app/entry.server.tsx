import {PassThrough} from "node:stream";
import {createReadableStreamFromReadable} from "@react-router/node";
import type {EntryContext} from "react-router";
import {ServerRouter} from "react-router";
import {isbot} from "isbot";
import {renderToPipeableStream} from "react-dom/server";
import {addDocumentResponseHeaders} from "./shopify.server";

const ABORT_DELAY = 5000;

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
) {
  addDocumentResponseHeaders(request, responseHeaders);
  const userAgent = request.headers.get("user-agent");
  const callbackName = userAgent && isbot(userAgent) ? "onAllReady" : "onShellReady";

  return new Promise<Response>((resolve, reject) => {
    const {pipe, abort} = renderToPipeableStream(
      <ServerRouter context={routerContext} url={request.url} />,
      {
        [callbackName]: () => {
          const body = new PassThrough();
          responseHeaders.set("Content-Type", "text/html");
          resolve(new Response(createReadableStreamFromReadable(body), {headers: responseHeaders, status: responseStatusCode}));
          pipe(body);
        },
        onShellError: reject,
        onError(error) {
          responseStatusCode = 500;
          console.error(error);
        },
      },
    );
    setTimeout(abort, ABORT_DELAY);
  });
}
