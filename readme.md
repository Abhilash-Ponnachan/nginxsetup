# Sample NGINX Project

### Learn NGINX configuration, and use its JavaScript (`njs`) Module

### Table of Contents

1. [**Objective**](#objective)
2. [**Run NGINX using Docker**](#nginx-with-docker)
3. [**Serve Custom Content**](#custom-content)
4. [**NGINX JavaScript Module**](#javascript-module)
5. [**Reverse Proxy (Custom Code)**](#reverse-proxy)
6. [**Kubernetes Deployment**](#k8s-deploy)

## Objective<a name="objective"></a>

A sample project to get familiar with using `NGINX`, going beyond the default configuration. We plan to do the following:

- Run `NGINX` using `Docker`, with the _default configuration_ (making it a **web-server**) and connect to it.
- Understand the _location_ and _structure_ of the _configurations_.
- Modify the _content_ and serve up our _custom web page_.
-  Extend the capability to provide an HTTP API using the `JavaScript` **module**.
- Configure another `NGINX` instance as a **reverse-proxy** and front our **web-server**.
- Add custom functionality in the **reverse-proxy** for `JWT` based _authorisation_ (using `JavaScript` module).
- Deploy all of this into a local `Kubernetes` cluster, and access it via an `Ingress`.

We shall be working throughout using the **`Docker` `nginx`** image, as it is much more convenient and avoids us having to install anything.  Some basic knowledge of **`Docker`** images and running containers would be required. All the files explained in this `readme` are included in this repository and can be used as it is.

For the last part where we deploy all of this to **`Kubernetes`**, a working knowledge of **`Kubernetes`** would be required to do that section. However, it is perfectly fine to skip that part, if the intention is just to learn and explore `NGINX`.

The most important _objective_, though is to **enjoy** the learning process, have some **fun** while we build our confidence in working with this tool. 

## Run NGINX using Docker<a name="nginx-with-docker"></a>

To get `NGINX` running as a **web-server** with its _default configuration_ is pretty straightforward. Using `Docker` we simply do a `docker run` and specify the **`nginx`** image and expose it on a `localhost` _port_ (the `nginx` service itself run on **port 80** by default, so we can bind it to something like `8080` on the host).

```bash
$ docker run --rm --name=my-nginx-web -p 8080:80 nginx

/docker-entrypoint.sh: /docker-entrypoint.d/ is not empty, will attempt to perform configuration
...
2022/09/09 10:14:05 [notice] 1#1: start worker process 37
2022/09/09 10:14:05 [notice] 1#1: start worker process 38
...
```

Use a web browser to navigate to `http://localhost:8080` and we should see the _default NGINX_ web page =>

<img src="doc/nginx-web-default.png" alt-text="Default NGINX web page" style="border: 2px solid"/>

Next we can `exec` into the `Docker container` and introspect the `NGINX` service running in it (using the `nginx` command).

```bash
$ docker exec -it my-nginx-web sh
\# nginx -help
nginx version: nginx/1.23.0
Usage: nginx [-?hvVtTq] [-s signal] [-p prefix]
             [-e filename] [-c filename] [-g directives]

Options:
  -?,-h         : this help
  -v            : show version and exit
  -V            : show version and configure options then exit
  -t            : test configuration and exit
  -T            : test configuration, dump it and exit
  -q            : suppress non-error messages during configuration testing
  -s signal     : send signal to a master process: stop, quit, reopen, reload
  -p prefix     : set prefix path (default: /etc/nginx/)
  -e filename   : set error log file (default: /var/log/nginx/error.log)
  -c filename   : set configuration file (default: /etc/nginx/nginx.conf)
  -g directives : set global directives out of configuration file
```

The `nginx -h` gives us all the options that the command takes and what we can do with it. If we want more details of the _configuration options_ we can the  `-V` option. As it is we see that the _default configuration file is_ **`/etc/nginx/nginx.con`**. For moist of what we do in this this is the most relevant file at the _root_ of everything else we do.

```bash
\# nginx -V
nginx version: nginx/1.23.0
...
TLS SNI support enabled
configure arguments: --prefix=/etc/nginx --sbin-path=/usr/sbin/nginx --modules-path=/usr/lib/nginx/modules --conf-path=/etc/nginx/nginx.conf --error-log-path=/var/log/nginx/error.log ...
# and a whole bunch of configured paths, options, modules...
```

For what we are about to do the most relevant part is the `--prefix=/etc/nginx`, as that directory contains everything related to _configuration_ and the _modules_. If we look at the contents of that directory, is should look something like.

```bash
\# ls -lh /etc/nginx
total 28K
drwxr-xr-x 2 root root 4.0K Sep  9 10:14 conf.d
-rw-r--r-- 1 root root 1007 Jun 21 14:25 fastcgi_params
-rw-r--r-- 1 root root 5.3K Jun 21 14:25 mime.types
lrwxrwxrwx 1 root root   22 Jun 21 16:54 modules -> /usr/lib/nginx/modules
-rw-r--r-- 1 root root  648 Jun 21 16:54 nginx.conf
-rw-r--r-- 1 root root  636 Jun 21 14:25 scgi_params
-rw-r--r-- 1 root root  664 Jun 21 14:25 uwsgi_params
```

Let us copy this entire directory from the `Docker container` to our host machine (we'll copy it to a `web/config` directory). We shall then modify the _configuration_ and _content_ as we require and mount it back to that same location in the `container`. This is the _mechanism_ we shall use throughout to achieve customisation.

```bash
# we keep everything related to the web-server in a directory called web
$ docker cp my-nginx-web:/etc/nginx/ web/config/

# now we should have a directory like this on our host
$ tree
.
└── web
    ├── config
    │   ├── conf.d
    │   │   ├── apis.js
    │   │   └── default.conf
    │   ├── fastcgi_params
    │   ├── mime.types
    │   ├── modules -> /usr/lib/nginx/modules
    │   ├── nginx.conf
    │   ├── scgi_params
    │   └── uwsgi_params
```

Note that we shall be using only a couple of those files, but lets just keep the whole directory as it is to make things simpler to mount back in.

Since **`nginx.conf`** is the _configuration_ file, let us open it up and take a look =>

```nginx
 user  nginx;
 worker_processes  auto;
 
 error_log  /var/log/nginx/error.log notice;
 pid        /var/run/nginx.pid;
 
 
 events {
     worker_connections  1024;
 }
 
 
 http {
     include       /etc/nginx/mime.types;
     default_type  application/octet-stream;
 
     log_format  main  '$remote_addr - $remote_user [$time_local] "$request" ' ...;
 
     access_log  /var/log/nginx/access.log  main;
 
     sendfile        on;
     #tcp_nopush     on;
 
     keepalive_timeout  65;
 
     #gzip  on;
 
     include /etc/nginx/conf.d/*.conf;
 }
```

There are lots of parameters, directives which we can use to control /configure the `nginx` service with, such as the `user` the service runs as, the number of worker processes, format of the log string (`log-format`) etc. A good place to refer/learn about these sections is the official documentation [[nginx conf structure]](#1). 

The relevant part for us in this project is the **`include /etc/nginx/conf.d/*.conf`** declaration. Essentially, importing all the detailed configurations from **`*.conf`** files in the **`/etc/nginx/conf.d`** directory. 

Out of the box, this directory will just contain a **`default.conf`** file, and this is where we will do most of our work (_If we wish to separate out our configuration logic into a different file, that's possible as well_).

```nginx
server {
     listen       80;
     listen  [::]:80;
     server_name  localhost;
 
     #access_log  /var/log/nginx/host.access.log  main;
 
     # this is what we shall focus on for now***
     location / {
         root   /usr/share/nginx/html;
         index  index.html index.htm;
     }
 
     #error_page  404              /404.html;
 
     # redirect server error pages to the static page /50x.html
     error_page   500 502 503 504  /50x.html;
     location = /50x.html {
         root   /usr/share/nginx/html;
     }
 
    # .. commented out sections
 }
```

This file defines a `Server` with the `server_name` `localhost` on `port 80`. The `location` directive declares a _block_ that specifies a directory **`/usr/share/nginx/html`** from where the HTML and any other referenced web assets will be served back (when it receives a request at the root path `/`). it also specifies some _error redirection pages.

We shall try to create our own web content and replace the default `index.html` with our page. To achieve this with minimal config changes, we can copy the contents of this directory from the container to a path on our host (we'll copy it to `web/content`).

```bash
$ docker cp my-nginx-web:/usr/share/nginx/html/ web/content/
```

Now our **`web`** directory should look like =>

```bash
$ tree web
web
├── config
│   ├── conf.d
│   │   └── default.conf
│   ├── fastcgi_params
│   ├── mime.types
│   ├── modules -> /usr/lib/nginx/modules
│   ├── nginx.conf
│   ├── scgi_params
│   └── uwsgi_params
└── content
    ├── 50x.html
    └── index.html
```

We have copies of the directories and files we need to do our customisation on the _host_, and when we are done making our changes we can run the _container_ again mounting these back into it as needed.

We shall modify the HTML contents to make our own web page. I made a simple `index.html` with some static text in a `<div>` and added some styling (`style.css`). The `web/content` directory should now have the following files =>

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
$ docker run --rm -d --name=my-nginx-web -v $(pwd)/content:/usr/share/nginx/html -p 8080:80 nginx
```

If we access `http://localhost:8080`from the browser now, we should get a nice little page with a verse of a famous poem.

<img src="doc/nginx-web-custom.png" alt-text="Default NGINX web page" style="border: 2px solid"/>

We have now managed to expose our own custom content as a web page from `Nginx`. Next we shall see how to add more dynamic functionality with some `JavaScript` code, taking advantage of `NGINX` extensible modular architecture.


### NGINX JavaScript (njs)
The power of `Nginx` comes from its easy extensibility, using **Modules** [[nginx modules]](#2). When we require a capability provided by some **module**, we can import that into the `nginx.conf` using the `load_module` **directive**, and when the process starts/reloads it will load the module and make its functionalities available. `NGINX` distributions come with some _default_ set of modules, and there are also _third party modules_ which we can download and install.  In extreme cases we can write our _own custom modules_ if required. For this project we shall use what is available by default with `NGINX` `Docker` image.

Within the `config` directory we saw a `modules -> /usr/lib/nginx/modules` symlink. 

If we look inside that we will be able to see the different extension **modules** available (out-of-the-box) with `Nginx`.

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

This link [[nginx javascript module]](#3) provides a very good introduction to the topic.

To get on with our purpose of study however, let us create a 'path'(block) within the `default server` configuration
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

So our API can be accessed with a GET request to `<origin>/api/hello`. For this to actually do anything, we need to write some `JavaScript` code and import it. Let us add an `apis.js` file in the same (`conf.d`) directory and place our `JavaScript` code int it. The `Nginx njs` module gives us some objects and functions to do various things like interact with the `request`/`response` etc. (documentation for reference [[njs reference]](#4), excellent collection of examples [[njs examples]](#5)). Using those resources we can write up our own `njs` code in the `apis.js` file:

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

Note we have specified the backend as the _Docker IP_ (`172.17.0.2`) of the container which is running our **NGINX web app** (which we set up above), also note that on the container it run on **port 80** (_default HTTP_), even though we exposed it on the _host_ on **port 8080**. The reason we do this is because both the containers will be on the default `Docker bridge` **Network**, and the _container IP_ on that network is what they can use to do network communication. This is only _temporary_, just to demonstrate the **reverse-proxy** capabilities. When we finally deploy this to `Kubernetes` it will be much simpler (we wont have to deal with `IPs`). 

After this we run another instance of `NGINX` container on **port 9090** and mount this modified configuration as its `/etc/nginx` volume.

```bash
 $ docker run --rm --name=nginx-proxy -p 9090:80 -v $(pwd)/proxy/config:/etc/nginx nginx
```

If we now access the `http://localhost:9090` URL in our browser we should be "proxied" to the actual backend (running on **port 8080**) and see our custom web page.

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

Whilst there is a non-trivial amount of code here, the steps to generate `JWT` is pretty straight forward and the comments explain it pretty well. I relied heavily on the _reference documentation_ ([[njs reference]](#4)), and the _examples_ ([[njs examples]](#5)) to get this right. Also keep in mind, that this is just  to make learning experience more fun, the specifics of generating `JWT` is not a necessary requirement to understand `NGINX` configuration, though that knowledge can certainly help with real-world applications, especially when it comes to troubleshooting.

Now if we re-run the container (same as before).

```bash
 $ docker run --rm --name=nginx-proxy -p 9090:80 -v $(pwd)/proxy/config:/etc/nginx nginx
```



And, we do a `curl POST` request to the `/jwt` URL (with some test claims), we should get back a `JWT` signed by our `NGINX` service. 

```bash
$ curl -X POST -H 'Content-Type: application/json' http://localhost:9090/jwt -d '{ "sub": "alice", "role": "admin"}' && echo

eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhbGljZSIsInJvbGUiOiJhZG1pbiIsImlzcyI6Im5naW54IiwiZXhwIjoxNjYxOTYzMjI2fQ.-aFKvCWvoMGsGT8b7SNhfFzHs4GmsG1IEeHE5FcDPY8
```

That long piece of string is the `JWT` and we can validate that it is so, by using some tool (for example https://jwt.io/). 

##### Validating JWT

Now that we have a way to generate signed `JWT` we shall embellish our **reverse-proxy** to enforce "validation" for some requests. So in this case we will validate that if there is request coming to any `/api/` paths then it should have valid `JWT` signed by us.  To achieve this we need to add a new 'path' (or `loaction`) block in our `conf.d/default.conf`for our **reverse-proxy**.  

Since we want to match all paths beginning with `/api/*` we will use the _directory match pattern_ (I found this article from `Digita Ocean` describes with examples the various patterns for `NGINX` `location` directive very well [[nginx location directive]](#6)).

The next thing we require to _authenticate_ a request is to be able to intercept it, examine it and then conditionally reject it, or pass it on. In `NGINX` the simplest way to achieve this is using the `auth_request` directive. We have setup the target of the `auth_request` to be an `internal` location (subrequest) that just executes some `njs` code (the `auth.validate` function). If the function returns with a `200` response then it is considered success and the control passes on to the next directive (`proxy_pass`), else it fails and returns back to the client with the appropriate error. This module (and directive) is commonly used for _authentication sub requests_, and a lot of details and examples can be found in these documentations ([[nginx auth_request]](#7)).

With the new 'path' (`location`) added for _authentication_, our `default.conf` should look like.

```nginx
 # import our auth.js file
 js_import conf.d/auth.js;
 
 server {
	...
        
     # proxy default path to backend
     location / {
         proxy_pass  http://172.17.0.2:80;
     }
 
     # validate /api/ req and proxy
     location /api/ {
         auth_request /validate;
         proxy_pass  http://172.17.0.2:80;
     }
 
     # internal target for auth validation
     location /validate {
       internal;
       js_content auth.validate;
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



_Instead of repeating the target of the `proxy_pass` twice (`http://172.17.0.2:80` in this case), there is a way to declare it once using the `upstream` directive and reference that in other places. We shall keep it like this for now to avoid introducing too many directives at once. We can eventually clean it up._

Now we are all set to do the _fun_ stuff and write `njs` code to validate the incoming request to check for signed `JWT`. We do that in our `validate` function within `auth.js`.

```javascript
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
        //r.return(200, `${signPart}\n${dataPart}\n${valid}\n`); // for DEBUG
        //return;
        if (valid){
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
```

Semantically the code is similar to the `jwt(r)` function. We are creating the _signing (validating) key_ just like before (using the same 'secret key value'), then extracting the 'signature part' from the `JWT` and using the `crypto.subtle.verify()` method to validate that with the 'header & body'. If it is valid then we send a `200` response else we respond accordingly with `40x` errors (_most of the code is error handling_).

We can test this out by using the `/jwt` endpoint of the **reverse-proxy** to generate a token, then use that as `Bearer <token>` in the `Authorization` header to the `/api/hello` URL.

```bash
$ token=$(curl -X POST -H "Content-type: application/json" -d '{"sub": "Alice"}' http://localhost:9090/jwt)
# use the $token variable when making request
$ curl -H "Authorization: Bearer $token" http://localhost:9090/api/hello | jq '.'
{
  "Message": "Hello from NGINX njs!",
  "Method": "GET",
  "HTTP Version": "1.0",
  ...
  "Args": ""
}
```

If we mutate the token, or do not pass the token we will get a `40x` error back from the **reverse-proxy**. 

Note also that we have managed to apply this validation only to any `/api` paths, so if we try to access the default page `http://localhost:9090` in a web browser, we should still be able to see the page (_without passing in any tokens_).

With this we have enabled our **reverse-proxy** to be a **frontend** that only allows authenticated requests  (for `/api/`).

##### Modifying Proxied Headers

With a few changes to the `defualt.conf` and a couple of extra lines to the `auth.js` we can go beyond simply validating the request. We can use `JavaScript` logic to construct and pass on specific **headers** to the **upstream** (backend). The first change is in the `auth.js` `validate` function. We add a small section to extract the `sub` claim from the `JWT` payload and return that in the `response-header` (if the `JWT` is valid).

```javascript
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
```



Next we have to make some changes to the `location /api/`  block in our `default.conf` , so as to be able to access this _response header_ from the `auth_request` (which comes from the `njs` code), and set that as _request header_ to be proxied **upstream**. To achieve this we use two additional directives `auth_request_set` and `proxy_set_header`. The modified section in the configuration will look as below. (_Note: figuring out how to get this to work took a lot of searching and trial-and-error! But it was worth it in the end._)

```nginx
# validate /api/ req and proxy
location /api/ {
    auth_request /validate;
    # assign njs-response header (Claims-sub) to variable $auth_claim_sub
    auth_request_set $auth_claim_sub $sent_http_claims_sub;
    # add that as header to proxy upstream
    proxy_set_header Auth-sub $auth_claim_sub;
    # hide Authorization header
    proxy_set_header Authorization "";

    proxy_pass  http://172.17.0.2:80;
}
```

The `auth_request_set` directive access the _header_ (`Claim-sub`) received from the `auth_request` step and assign that to the `$auth_claim_sub` variable. Then we use the `proxy_set_header` directive to add that to the **upstream** request. Also we are hiding the original `Authorization` header by setting it to an empty value.

If we test out our `/api/hello` endpoint with a `Bearer <token>` , we should be able to see that the **upstream** (backend) actually receives **request headers** that have been _intercepted_, _validated_ and _modified_ by our **reverse-proxy**. And we did all that with just the _out-of-the-box_ available modules and directives (and a little bit of `njs` `JavaScript` code). 

```bash
$ curl -H "Authorization: Bearer $token" http://localhost:9090/api/hello | jq '.'
{
  "Message": "Hello from NGINX njs!",
  "Method": "GET",
  "HTTP Version": "1.0",
  "Remote Address": "172.17.0.3",
  "URI": "/api/hello",
  "Env": {
    "HOSTNAME": "eea7e80a0dc1",
    "HOME": "/root",
    "PKG_RELEASE": "1~bullseye",
    "NGINX_VERSION": "1.23.0",
    "PATH": "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    "NJS_VERSION": "0.7.5",
    "PWD": "/"
  },
  "Req-Headers": " Auth-sub = Alice Host = 172.17.0.2 Connection = close User-Agent = curl/7.68.0 Accept = */*",
  "Args": ""
}
```



_Note, that the request the backend application receives does not have `Authorization`, and it has an additional header `Auth-sub` with the value extracted from the `JWT` claim_.

## Deploying to Kubernetes

Finally we are ready to deploy all of what we have done to `Kubernetes`. I'm using a local `Kind` ([[kind cluster]](#8)) cluster, but you can use `MiniKube` or `DockerDesktop` or any other option, it does not really matter. Our `Deployment` is pretty standard, the only difference might be the configuration we have to do to enable sharing of **host** directory as `PersistentVolume` in the cluster _(for my `Kind` cluster I had to create it with the configuration for **extra mount** as described here [[kind extra mounts]](#9) ),_ and the `annotations` for the **Ingress Controller** your cluster uses (_I use an `NGINX Ingress` controller_).

Once we deploy the **manifests** given in the **`K8s`** directory, our `Kubernetes` solution would look like the diagram below. 

<img src="doc/nginx-app-k8s.png" alt-text="K8s Deployment" style="border: 2px solid"/>

Without getting too deep into the `Kubernetes` aspects, we can summarise the components as follows:

- Everything we do will be in the `ns-nginx-app` **Namespace** (_except **PersistentVolumes** which are independent of **namespaces**_).

- We have the following **PersistentVolumes** to load the files (_HTML/CSS content, and `NGINX` configurations we created above_) from the **host** onto the **Pods**. We use the `standard` **StoargeClass** and type as `hostPath`.

  - `pv-nginx-web-content` - points to the **host path** directory where we have our custom **HTML** and **CSS** for the web page.
  - `pv-nginx-web-config` - points to the **host path** directory where we have our `NGINX` configuration files for the **web-app**.
  - `pv-nginx-proxy-config` - points to the **host path** directory where we have our `NGINX` configuration files for the **reverse-proxy**.  

- At the backend we have a **Deployment** (`nginx-web`) with two replicas, and `nginx` image, onto which we **mount** the **content PersistentVolume**  (`pv-nginx-web-content`) to the **container path** `/usr/share/nginx/html`, and **configuration PersistentVolume** (`pv-nginx-web-config`) to the **container path** `/etc/nginx`. It publishes the default **port 80**.

- The `nginx-web` **Deployment** is fronted by a **ClusterIP Service** `svc-nginx-web`.

- In front of the **web app** sits our **reverse proxy Deployment** (`nginx-proxy`), and on this we mount the **proxy configuration PersistentVolume** (`pv-nginx-proxy-config`) to the **container path** `/etc/nginx`. In our `default.conf` file for the **reverse proxy** we specify the `upstream` as `svc-nginx-web`, which makes our `nginx-web` **Pods** the backend target to which the `nginx-proxy` **Pods** forward traffic.

- The `nginx-proxy` **Deployment** is exposed by its own **ClusterIP Service** `svc-nginx-proxy`.

- An **Ingress** with the **rule** to forward traffic coming with the path `localhost/nginxapp` to the **Service** `svc-nginx-proxy` makes it available to be accessed from outside the cluster.

  

  That is all there is to the `Kubernetes` **Deployment**. A few things to take note are, the steps to make a **host directory** available as **PersistentVolume** in your cluster setup may differ, also there could be specifics of the **Ingress** controller that require some additional configuration on how cluster-external HTTP requests are processed (_for `NGINX` Ingress we have to use an `annotation` for `nginx.ingress.kubernetes.io/rewrite-target:`_ ). Besides some small specifics, the whole **Deployment** setup is pretty straightforward and the **manifests** (`*.yaml` files in the **`k8s`** directory) is self explanatory.

  To test this out once deployed, we can use the **browser** to hit the **`http://localhost/nginxapp`** URL and we should see our custom web page (with the poem). We can also test out the **API** part as follows.

  ```bash
  # generate JWT token using the /jwt endpoint, send some subject claim
  $ curl -X POST -H "Content-type: application/json" -d '{"sub": "Feynman"}' http://localhost/nginxapp/jwt
  # should get back a JWT token like..
  eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJGZXlubWFuIiwiaXNzIjoiTkdJTlgtUHJveHkiLCJleHAiOiIxNjYyNDUyMzM4NjAwIn0.uKgmmZWL4UfDAjuSIQ5Ko886J27PoZFi-ydbgWxPfqQ
  
  # set that to a variable
  $ token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJGZXlubWFuIiwiaXNzIjoiTkdJTlgtUHJveHkiLCJleHAiOiIxNjYyNDUyMzM4NjAwIn0.uKgmmZWL4UfDAjuSIQ5Ko886J27PoZFi-ydbgWxPfqQ
  
  # make a request to the /api/hello endpoint using the token
  $ curl -H "Authorization: Bearer $token" http://localhost/nginxapp/api/hello | jq '.'
  # we should see a response like..
  {
    "Message": "Hello from NGINX njs!",
    "Method": "GET",
    "HTTP Version": "1.0",
    "Remote Address": "10.244.0.10",
    "URI": "/api/hello",
    "Env": {
      ...
      "NGINX_VERSION": "1.23.1",
      "PWD": "/",
      "NJS_VERSION": "0.7.6",
      ...
    },
    "Req-Headers": " Auth-sub = Feynman Host = backendwebapp Connection = close X-Request-ID = 8452b2f12bda1007c431c3ba5c718a6a X-Real-IP = 172.18.0.1 X-Forwarded-For = 172.18.0.1 X-Forwarded-Host = localhost X-Forwarded-Port = 80 X-Forwarded-Proto = http X-Forwarded-Scheme = http X-Scheme = http User-Agent = curl/7.68.0 Accept = */*",
    "Args": ""
  }
  # We see our requst is authorised and the sub claim has been extracted and added to req header for backend (Auth-sub=Feynman)
  ```

  

  ## Conclusion

  That is the end of the sample project walk-through. It has helped me learn quite a bit of `NGINX`  and whet our appetite to learn more. I found the article ([[nginx internals]](#10)) to understand some of the internals of the tool.

  
  
  ### References
  
  <a id="1">[nginx conf structure]</a> - http://nginx.org/en/docs/beginners_guide.html#conf_structure
  
  <a id="2">[nginx modules]</a> - http://nginx.org/en/docs/dev/development_guide.html#Modules
  
  <a id="3">[nginx javascriptmodule]</a> - https://www.nginx.com/blog/harnessing-power-convenience-of-javascript-for-each-request-with-nginx-javascript-module/
  
  <a id="4">[njs reference]</a> - https://nginx.org/en/docs/njs/reference.html
  
  <a id="5">[**njs examples**]</a> - https://github.com/nginx/njs-examples
  
   <a id="6">[nginx location directive]</a> - https://www.digitalocean.com/community/tutorials/nginx-location-directive
  
  <a id="7">[nginx auth_request]</a> - https://docs.nginx.com/nginx/admin-guide/security-controls/configuring-subrequest-authentication/, https://developer.okta.com/blog/2018/08/28/nginx-auth-request, http://nginx.org/en/docs/http/ngx_http_auth_request_module.html
  
  <a id="8">[kind cluster]</a> - https://kind.sigs.k8s.io/
  
  <a id="9">[kind extra mounts]</a> - https://kind.sigs.k8s.io/docs/user/configuration/#extra-mounts
  
  <a id="10">[nginx internals]</a> - https://www.nginx.com/blog/inside-nginx-how-we-designed-for-performance-scale/

