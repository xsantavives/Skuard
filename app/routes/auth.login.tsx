import type {ActionFunctionArgs, LoaderFunctionArgs} from "react-router";
import {Form, useActionData, useLoaderData} from "react-router";
import {login} from "../shopify.server";

export const loader = async ({request}: LoaderFunctionArgs) => {
  const errors = await login(request);
  return {errors};
};

export const action = async ({request}: ActionFunctionArgs) => {
  const errors = await login(request);
  return {errors};
};

export default function Login() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const errors = actionData?.errors ?? loaderData.errors;
  return (
    <main>
      <h1>Log in to Skuard</h1>
      <Form method="post">
        <label>
          Shop domain
          <input name="shop" placeholder="example.myshopify.com" />
        </label>
        {errors?.shop ? <p>{errors.shop}</p> : null}
        <button type="submit">Log in</button>
      </Form>
    </main>
  );
}
