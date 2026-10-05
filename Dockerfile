FROM nginx:alpine

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY frontend/ /usr/share/nginx/html/
COPY hacs/www/ /usr/share/nginx/html/hacs/www/

RUN mkdir -p /usr/share/nginx/html/spec

EXPOSE 80
