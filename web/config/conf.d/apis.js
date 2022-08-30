function helloApi(r){
  // set content-type for response
  r.headersOut['Content-Type'] = ['application/json'];

  // acc request headers
  let h = '';
  for (let k in r.headersIn){
    h += ` ${k} = ${r.headersIn[k]}`;
  }

  // acc args
  let a= '';
  for (let k in r.args){
    a += ` ${k} = ${r.args[k]}`;
  }

  // construct reponse
  const resp = {
    "Message": "Hello from NGINX njs!", 
    "Method": r.method,
    "HTTP Version": r.httpVersion,
    "Remote Address": r.remoteAddress,
    "URI": r.uri,
    "Env": process.env,
    "Req-Headers": h,
    "Args": a
  };

  // return response
  r.return(200, JSON.stringify(resp));
}

// export the function from the file
export default { helloApi }
