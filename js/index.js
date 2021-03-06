"use strict";

var base_url = "https://jmlxxvi.github.io/";

var url_search = window.location.search;
if(url_search) { load_post("posts/" + url_search.substr(1)); }

document.addEventListener("click", event => {
    if(event.target.classList.contains("internal_link")) {
        event.preventDefault();
        event.stopPropagation();
        load_post("posts/" + event.target.search.substr(1));
    }
});

var article_links = document.querySelectorAll("#articles-list a");
var support_text = document.getElementById("support_text");
var disqus_thread = document.getElementById("disqus_thread");
var article_body = document.getElementById("article-body");
var articles_list = document.getElementById("articles-list");
var home_link = document.getElementById("user_meta");

article_links.forEach(function (element) {
    element.addEventListener("click", function (event) {
        event.preventDefault();
        var url = event.srcElement.attributes.href.textContent;
        load_post(url);
    });
});

function load_post(url) {
    fetch(url)
    .then(function (response) {
        return response.text();
    })
    .then(function (text) {
        article_body.innerHTML = text;
        reload_code_syntax_highlighter();
        article_body.classList.remove("hidden");
        support_text.classList.remove("hidden");
        disqus_thread.classList.remove("hidden");
        articles_list.classList.add("hidden");
        disqus_reset(url)
    });
    window.history.pushState("", "", "?" + url.replace("posts/", ""));
}

home_link.addEventListener("click", function (event) {
    event.preventDefault();
    articles_list.classList.remove("hidden");
    article_body.classList.add("hidden");
    support_text.classList.add("hidden");
    disqus_thread.classList.add("hidden");
});

function reload_code_syntax_highlighter() {
    document.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightBlock(block);
    });
}

function disqus_reset(url) {
    var di = base_url + url;
    //https://stackoverflow.com/questions/8944287/disqus-loading-the-same-comments-for-dynamic-pages
    if (typeof DISQUS != 'undefined') {
        DISQUS.reset({
            reload: true,
            config: function () {
                this.page.identifier = di;
                this.page.url = di;
            }
        });
    }
}

