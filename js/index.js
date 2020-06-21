

var article_links = document.querySelectorAll("#articles-list a");

var article_body = document.getElementById("article-body");
var articles_list = document.getElementById("articles-list");

var home_link = document.getElementById("user_meta");

article_links.forEach(function (element) {

    element.addEventListener("click", function (event) {

        event.preventDefault();

        var url = event.srcElement.attributes.href.textContent;

        console.log(article_body)

        fetch(url)
            .then(function (response) {
                return response.text();
            })
            .then(function (text) {
                article_body.innerHTML = text;
                article_body.classList.remove("hidden");
                articles_list.classList.add("hidden");
            });

    });

});

home_link.addEventListener("click", function (event) {

    event.preventDefault();

    console.log("ok1!!")

    articles_list.classList.remove("hidden");
    article_body.classList.add("hidden");

});

