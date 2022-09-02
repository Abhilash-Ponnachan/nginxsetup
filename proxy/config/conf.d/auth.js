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
                                                false, ['sign', 'verify']);
  // form the signature for the header.body of the token
  const sign = await crypto.subtle.sign({name: 'HMAC'}, signKey, token);

  //const valid = await crypto.subtle.verify({name: 'HMAC'}, signKey, sign, token);

  // append the signature to form header.body.signature as JWT
  token += '.' + Buffer.from(sign).toString('base64url');

  //token += ' : ' + valid;

  // return token
  r.return(200, token);
}


async function validate(r){
  // hardcoded Key for now, we shall move these to secrets later
  const key = "INSECUREKEY";

  // get Authoriztion value from request header
  const authHdr = r.headersIn.Authorization;
  if (authHdr){
    // should be of the format..
    // Bearer <base64urlecoded header>.<base64urlecoded payload>.<base64urlecoded signature>
    let values = authHdr.split(" ");
    if ((values.length === 2) && (values[0] === 'Bearer')) {
      const tknParts = values[1].split(".");
      if ((tknParts.length === 3) && tknParts[0] && tknParts[1] && tknParts[2]) {
        // create signing key object based on the 'key' specified & algorithm
        // use 'crypto' object
        // Note algorithm is 'hardcoded', normally it would be drived/crosschecked with header
        const signKey = await crypto.subtle.importKey('raw', key, {name: 'HMAC', hash: 'SHA-256'},
                                                      false, ['verify']);
        // decode signature from base64url to buffer
        const signPart = Buffer.from(tknParts[2], 'base64url');
        // concatenate header & payload with '.'
        const dataPart = tknParts[0] + '.' + tknParts[1];
        // verify the signature
        const valid = await crypto.subtle.verify({name: 'HMAC'}, signKey, signPart, dataPart);
        if (valid){
          // try extract subject claim
          try {
            let payload = Buffer.from(tknParts[1], 'base64url').toString();
            payload = JSON.parse(payload);
            if (payload.sub){
              r.headersOut['Claims-sub'] = payload.sub;
            }
          } catch(err){
            // ignore if no subject claim
          }
          r.return(200, valid);
          return;
        }
        r.return(401, '*** Error, Inavlid JWT token *** !\n');
        return;
      }
      r.return(400, '*** Error, Bearer token is not a JWT token *** !\n');
      return;
    }
    r.return(400, '*** Error, missing Bearer token in Authorizatoin header *** !\n');
    return;
  }
  r.return(401, '*** Error, missing Authorization header *** !\n');
}


// export the functions from the file
export default { jwt, validate }
