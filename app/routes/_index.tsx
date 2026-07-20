import {redirect, type LoaderFunctionArgs} from "react-router";

export const loader = ({request}: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) return redirect(`/app?${url.searchParams.toString()}`);
  return redirect("/auth/login");
};
