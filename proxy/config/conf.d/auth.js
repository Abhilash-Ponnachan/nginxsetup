async function jwt(r){
  // values we need to generate JWT
  // hardcode for now, we shall move these to config/secrets later
  const key = "INSECUREKEY";
  const validity = 600; // seconds
  const issuer = "nginx";

  // the request must contain valid JSON
  if (r.headersIn['Content-Type'] != 'application/json') {
    r.return(400, "*** Content-Type must be application/json *** !\n");
  }

  // extract incoming claims as JSON object
  let body = '';
  let initClaims = {};
  try {
    body = r.requestText;
    initClaims = JSON.parse(body);
  } catch(err) {
    r.return(400, '*** Error parsing POST data to JSON *** !\n');
  }

  // construct full claim object
  const claims = Object.assign(
                  initClaims,
                  {iss: issuer},
                  {exp: Math.floor(Date.now()/1000) + validity}
                  );
  // header for JWT
  const header = {typ: "JWT", alg: "HS256"};
  // base64url encode header & claims and concatenate with '.'
  let token = [header, claims].map(JSON.stringify)
                              .map(v => Buffer.from(v).toString('base64url'))
                              .join('.');
  // create signing key object based on the 'key' specified & algorithm
  // use 'crypto' object
  const signKey = await crypto.subtle.importKey('raw', key, {name: 'HMAC', hash: 'SHA-256'},
                                                false, ['sign']);
  // form the signature for the header.body of the token
  const sign = await crypto.subtle.sign({name: 'HMAC'}, signKey, token);
  // append the signature to form header.body.signature as JWT
  token += '.' + Buffer.from(sign).toString('base64url');

  // return token
  r.return(200, token);
}

// export the function from the file
export default { jwt }
