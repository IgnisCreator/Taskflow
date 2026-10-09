// What the mocked `next/headers` returns: tests set the cookie of the "current request" here.
let current = new Headers();

export const setRequestHeaders = (headers: Headers) => {
  current = headers;
};
export const getRequestHeaders = () => current;
