# Simple NGINX setup with Docker & Kubernetes 

###### A simple example project to learn basic `NGINX` configuration for beginners.

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
  "Remote Address": "17x.1x.0.1",
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
$ mkdir proxy && cp -r web/config proxy/
```



