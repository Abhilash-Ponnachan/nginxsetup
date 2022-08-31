# Simple NGINX setup with Docker & Kubernetes 

## Objective

An example project to serve as an introduction to learn `NGINX` configuration, it's basic capabilities, how to customise it, take advantage of its extensibility features (using `njs` `JavaScript`), and finally deploy it all in `Kubernetes`.

We shall be working throughout using the `Docker` `nginx` image, so we wont have to install `NGINX` at all. This is meant to be a **beginner level** project for `NGINX` that will get us comfortable with custom configurations, scripting and using their documentation. 

Because we are doing everything using `Docker` some basic knowledge of using running containers is expected.

## Setting up NGINX to run with Docker

### Commands 
```bash
$ docker run --rm --name=my-nginx nginx

$ docker exec -it my-nginx /bin/sh

# nginx -V
nginx version: nginx/1.23.0
...
configure arguments: --prefix=/etc/nginx --sbin-path=/usr/sbin/nginx --modules-path=/usr/lib/nginx/modules --conf-path=/etc/nginx/nginx.conf ...

$ mkdir web

$ docker cp my-nginx:/etc/nginx web/

$ mv web/nginx/ web/config/

$ cd web

$ tree config/
config/
├── conf.d
│   └── default.conf
├── fastcgi_params
├── mime.types
├── modules -> /usr/lib/nginx/modules
├── nginx.conf
├── scgi_params
└── uwsgi_params

$ vim config/nginx.conf
 ... ** Note -> include /etc/nginx/conf.d/*.conf;

$ vim config/conf.d/default.conf
... ** Note -> 
	location / {
            root   /usr/share/nginx/html;
	    index  index.html index.htm;
	 }

$ docker cp my-nginx:/usr/share/nginx/html web/

$ mv web/html/ web/content/
```

Test accessing the webserver with default config
```bash
$ docker run --rm -d --name=my-nginx -p 8080:80 nginx
```

Browser or Curl http://localhost:8080
```html
<html>
  <head>
    <title>Welcome to nginx!</title>
    <style> ... </style>
  </head>
  <body>
    <h1>Welcome to nginx!</h1>
    <p>If you see this page, the nginx web server is successfully installed and
    working. Further configuration is required.</p>
    ...
  </body>
</html>
```
>>> add image

$ cd web/

Modify the HTML contents to make our own web page. We change the `index.html` & add a `style.css` stylesheet.
```bash
$ tree content/
content/
├── 50x.html
├── index.html
└── style.css

```

Now we run `nginx` `Docker` image again but this time we mount our `content` directory as the volume `/usr/share/nginx/html`
within the container.
```bash
$ docker run --rm -d --name=my-nginx -v $(pwd)/content:/usr/share/nginx/html -p 8080:80 nginx
```

Browser http://localhost:8080
>>> add image

Now if we access it from the browser, we should get a nice little page with a verse of a famous poem.
So we have managed to expose our own custom content as a web page from `Nginx`.


### NGINX JavaScript (njs)
The power of `Nginx` comes from its easy extensibility, using **Modules**. Using the `nginx.conf` load the **module/s** we need and we can start using the functions/capabilities it provides with the appropriate **directives**.

Within the `config` directory we saw a `modules -> /usr/lib/nginx/modules` symlink. 

If we look inside that we will be able to see the different extension modules available (out-of-the-box) with `Nginx`.

```bash
$ docker run --rm -d --name=my-nginx nginx
..
$ $ docker exec -it my-nginx ls -lh /etc/nginx/modules/
total 3.6M
-rw-r--r-- 1 root root  20K Jun 21 16:54 ngx_http_geoip_module-debug.so
-rw-r--r-- 1 root root  20K Jun 21 16:54 ngx_http_geoip_module.so
-rw-r--r-- 1 root root  27K Jun 21 16:54 ngx_http_image_filter_module-debug.so
-rw-r--r-- 1 root root  27K Jun 21 16:54 ngx_http_image_filter_module.so
-rw-r--r-- 1 root root 875K Jun 21 16:56 ngx_http_js_module-debug.so
-rw-r--r-- 1 root root 871K Jun 21 16:56 ngx_http_js_module.so
-rw-r--r-- 1 root root  23K Jun 21 16:54 ngx_http_xslt_filter_module-debug.so
-rw-r--r-- 1 root root  23K Jun 21 16:54 ngx_http_xslt_filter_module.so
-rw-r--r-- 1 root root  20K Jun 21 16:54 ngx_stream_geoip_module-debug.so
-rw-r--r-- 1 root root  20K Jun 21 16:54 ngx_stream_geoip_module.so
-rw-r--r-- 1 root root 853K Jun 21 16:56 ngx_stream_js_module-debug.so
-rw-r--r-- 1 root root 849K Jun 21 16:56 ngx_stream_js_module.so
```

In our case we will use the `ngx_http_js_module.so` module to execute some JavaScript when the server receives a Request and form a Response back. Note, however that the `Nginx` JavaScript module is a custom runtime implementation of the ECMAScript standards (unlike Node.js which uses the **V8** Engine). It is also NOT meant to be used as an application server, but more as a **middleware** for validating, modifying requests/responses. 

This link (https://www.nginx.com/blog/harnessing-power-convenience-of-javascript-for-each-request-with-nginx-javascript-module/) provides a very good introduction to the topic.

To get on with our purpose of study however, let us create a 'path' within the `default server` configuration
that accepts a GET request and returns a JSON response (with some details such as headers, env variables etc.).

First load the `ngx_http_js_module.so` in the main `nginx.conf` file (do that right at the beginning of the file).

```nginx
#load nginx JS module
load_module modules/ngx_http_js_module.so;
 
user  nginx;
worker_processes  auto;
...
```

Next add a 'path (`location`)' section in the `config/conf.f/default.conf`  file, for our HTTP API and specify a `JavaScript` function as the target using the `js_content` directive.

```nginx
 # api URL path for JS content
 location /api/hello {
 	js_content <our imported JS functon>
 }
```

So our API can be accessed with a GET request to `<origin>/api/hello`. For this to actually do anything, we need to write some `JavaScript` code and import it. Let us add an `apis.js` file in the same (`conf.d`) directory and place our `JavaScript` code int it. The `Nginx njs` module gives us some objects and functions to do various things like interact with the `request`/`response` etc. (documentation for reference https://nginx.org/en/docs/njs/reference.html, excellent collection of examples https://github.com/nginx/njs-examples). Using those resources we can write up our own `njs` code in the `apis.js` file:

```javascript
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
```

It is a simple function to read some `request`, `env` values and form a response. The code and the comments should be self-explanatory.

Now we have to specify this function in the `default.conf` (after importing this `apis.js` file).

```nginx
 # import our JavaScript code file
  js_import conf.d/apis.js;
  
  server {
      listen       80;
      listen  [::]:80;
      server_name  localhost;
  
      #access_log  /var/log/nginx/host.access.log  main;
  
      # default path for serving custom static web page
      location / {
          root   /usr/share/nginx/html;
          index  index.html index.htm;
      }
  
  
      # api URL path for JS content
      location /api/hello {
        js_content apis.helloApi;
      }
  
      #error_page  404              /404.html;
  
      # redirect server error pages to the static page /50x.html
      error_page   500 502 503 504  /50x.html;
      location = /50x.html {
          root   /usr/share/nginx/html;
      }
  
  }

```

Now we can run our `NGINX` container again, but this time mount our local `config` directory with all the code changes we did to the `/etc/nginx` path within the container.

```bash
$ docker run --rm --name=my-nginx -p 8080:80 -v $(pwd)/web/content:/usr/share/nginx/html -v $(pwd)/web/config:/etc/nginx nginx
```

We should see it successfully launched and we can test it with a `curl` command.

```bash
$ curl http://localhost:8080/api/hello | jq '.'
 {
  "Message": "Hello from NGINX njs!",
  "Method": "GET",
  "HTTP Version": "1.1",
  "Remote Address": "172.17.0.1",
  "URI": "/api/hello",
  "Env": {
    "HOSTNAME": "36edf300e46d",
    "HOME": "/root",
    "PKG_RELEASE": "1~bullseye",
    "NGINX_VERSION": "1.23.0",
    "PATH": "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    "NJS_VERSION": "0.7.5",
    "PWD": "/"
  },
  "Req-Headers": " Host = localhost:8080 User-Agent = curl/7.68.0 Accept = */*",
  "Args": ""
}
```

If we include _command line arguments_, we can see that in the response as well.

```bash
$ curl http://localhost:8080/api/hello?s=somevalue | jq '.'
{
  "Message": "Hello from NGINX njs!",
  ...
  "Env": {
    "HOSTNAME": "36edf300e46d",
   ...
  },
  "Req-Headers": " Host = localhost:8080 User-Agent = curl/7.68.0 Accept = */*",
  "Args": " s = somevalue"
}
```

By the way,when we run in `Docker`, the `HOSTNAME` we see above is the `Container ID` of the running container. Also the `Remote-Address` will be `Docker Gateway` IP.

### NGINX Reverse-Proxy

Now that we know a little better about how to configure & customise `NGINX` and make it work with some `njs` script, let us move on to the next step of configuring `NGINX` as a **reverse-proxy**, which is one of its most common use cases. 

Since we already setup a **web server** to serve static content, and an HTTP API above (exposed on **port 8080**), we can use that as the backend for our **reverse-proxy**. We shall run another `Docker` instance of `NGINX` (configured to work as **reverse-proxy**), expose it on **port 9090** and point it to our above application as backend.

The first step is to make a new directory for our **proxy configuration**, copy over the existing **web configuration** and modify that.

```bash
$ mkdir proxy && cp -r web/config proxy/config
```

For the **proxy configuration** we can leave the `nginx.conf` as it is (_even though it has the `load_module` for `njs` we can ignore that just for now, we shall be using that a little later_). In the `conf.d/default.conf` we change the section for `location /` path from HTML directory to a `proxy_pass` directive with the target backend (our **web application** running on **port 8080**).

```nginx
# It is OK toignore this for now, 
 # we shall use this import only later
 js_import conf.d/apis.js;
 
 server {
     listen       80;
     listen  [::]:80;
     server_name  localhost;
     
     #access_log  /var/log/nginx/host.access.log  main;
     
     # proxy default path to our web-backend
     location / {
         proxy_pass  http://172.17.0.2:80;
     }
 
     
     #error_page  404              /404.html;
     
     # redirect server error pages to the static page /50x.html
     error_page   500 502 503 504  /50x.html;
     location = /50x.html {
         root   /usr/share/nginx/html;
     }
 
 }
```

The only real change we have done is the `proxy_pass` directive. 

Note we have specified the backend as the _Docker IP_ (`172.17.0.2`) of the container which is running our **NGINX web app** (which we set up above), also note that on the container it run on **port 80** (_default HTTP_), even though we exposed it on the _host_ on **port 8080**. The reason we do this is because both the containers will be on the default `Docker bridge` **Network**, and the _container IP_ on that network is what they can use to do network communication. This is only _temporary_, just to demonstrate the **reverse-proxy** capabilities. When we finally deploy this to `Kubernetes` it will be much simpler (we wont have to deal with IPs). 

After this we run another instance of `NGINX` container on **port 9090** and mount this modified configuration as its `/etc/nginx` volume.

```bash
 $ docker run --rm --name=nginx-proxy -p 9090:80 -v $(pwd)/proxy/config:/etc/nginx nginx
```

If we now access the `http://localhost:9090` URL in our browser we should be "proxied" to the actual backend (running on **port 8080**) and see our original page.

> > Insert screen shot

If we use `curl` command to test the `api/hello` endpoint we should see:

```bash
$ curl http://localhost:9090/api/hello | jq '.'
 {
  "Message": "Hello from NGINX njs!",
  "Method": "GET",
  "HTTP Version": "1.0",
  "Remote Address": "172.17.0.3",
  "URI": "/api/hello",
  "Env": {
    "HOSTNAME": "36edf300e46d",
    "HOME": "/root",
    "PKG_RELEASE": "1~bullseye",
    "NGINX_VERSION": "1.23.0",
    "PATH": "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    "NJS_VERSION": "0.7.5",
    "PWD": "/"
  },
  "Req-Headers": " Host = 172.17.0.2 Connection = close User-Agent = curl/7.68.0 Accept = */*",
  "Args": ""
}
```

Note that we get the similar response as when we called the **web app** directly, and also note that the `Remote Address` in this case shows `172.17.0.3` which is the IP of our **reverse proxy**. We can see that easily with a `docker inspect` command.

```bash
$ docker inspect nginx-proxy -f '{{.NetworkSettings.IPAddress}}'
172.17.0.3
```

So the **nginx-proxy** container receives the request, proxies it to the **nginx web-app**, and relays the response back to the client.

#### Enhance the Reverse-Proxy Capability

As it is, this **reverse-proxy** is just a pass-through, so let us enhance that to do something interesting. Let us make it inspect the `request` to check if it has a valid `JWT` token in the `header` and only allow the `request` if it does, otherwise we block it. In other words we try to mimic what a typical `authentication proxy` may do. Of course our project will do it in a much simpler way than an actual implementation. 

##### Generate JWT API

First we need to be able to generate a valid `JWT` token. Normally this would be handled in an **Authentication flow** by some **Authentication Service** or **Token Service**. To keep things simpler and more focused at learning `NGINX` let us write an HTTP API using `njs` that can generate a `JWT` token and implement that on our **reverse-proxy**. Again, this is not something we would do in such a component, but this makes it easier for the demonstration project.

Similar to what we did with the `api/hello` for the **nginx web app**, we will add a `JavaScript` file (let us call it `auth.js`) in the `conf.d` directory. We will then write our code in there and add a path to invoke that in our `default.conf` file. At this point we can simply rename the `apis.js` we had copied from the **web app** config.

```bash
$ mv proxy/config/conf.d/apis.js proxy/config/conf.d/auth.js
```

Now our configuration directory for the **reverse proxy** should look like:

```bash
$ tree proxy/
proxy/
└── config
    ├── conf.d
    │   ├── auth.js
    │   └── default.conf
    ├── fastcgi_params
    ├── mime.types
    ├── modules -> /usr/lib/nginx/modules
    ├── nginx.conf
    ├── scgi_params
    └── uwsgi_params
```

Now we can modify our `default.conf` to import `auth.js` , and also add a 'path' (let is say `/jwt`) to invoke a `JavaScript` function that can accept a `POST` request with some **'claims'** and return a **signed JWT**.

```nginx
 # import our auth.js file
 js_import conf.d/auth.js;
 
 server {
     listen       80;
     listen  [::]:80;
     server_name  localhost;
 
     #access_log  /var/log/nginx/host.access.log  main;
 
     # proxy default path to backend
     location / {
         proxy_pass  http://172.17.0.2:80;
     }
 
     # path to generate jwt
     location /jwt {
         js_content auth.jwt;
         # only support POST requests
         limit_except POST {
           deny all;
         }
     }
 
    ...
 }
```

We are using the `js_content` directive to target the `JavaScript` function, and the `limit_except POST` directive to constraint the request to only `POST` calls.

Now we have to implement the logic of generating a `JWT` token in `JavaScript` using `njs`. So our `auth.js` will be as shown below.

```javascript
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
```

Whilst there is a non-trivial amount of code here, the steps to generate `JWT` is pretty straight forward and the comments explain it pretty well. I relied heavily on the _reference documentation_ (https://nginx.org/en/docs/njs/reference.html), and the _examples_ (https://github.com/nginx/njs-examples) to get this right. Also keep in mind, that this is just  to make learning experience more fun, the specifics of generating `JWT` is not a necessary requirement to understand `NGINX` configuration, though that knowledge can certainly help with real-world applications, especially when it comes to troubleshooting.

Now if we re-run the container (same as before).

```bash
 $ docker run --rm --name=nginx-proxy -p 9090:80 -v $(pwd)/proxy/config:/etc/nginx nginx
```



And, we do a `curl POST` request to the `/jwt` URL (with some test claims), we should get back a `JWT` signed by our `NGINX` service. 

```bash
$ curl -X POST -H 'Content-Type: application/json' http://localhost:9090/jwt -d '{ "sub": "alice", "role": "admin"}' && echo

eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhbGljZSIsInJvbGUiOiJhZG1pbiIsImlzcyI6Im5naW54IiwiZXhwIjoxNjYxOTYzMjI2fQ.-aFKvCWvoMGsGT8b7SNhfFzHs4GmsG1IEeHE5FcDPY8
```

That long piece of string is the `JWT` and we can validate that it is so by using some tool (for example https://jwt.io/). 

##### Validating JWT

Now that we have a way to generate signed `JWT` we shall embellish our **reverse-proxy** to enforce "validation" for some requests. So in this case we will validate that if there is request coming to any `/api` paths then it should have valid `JWT` signed by us. 