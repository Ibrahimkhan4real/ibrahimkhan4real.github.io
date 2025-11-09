const POSTS_INDEX = 'blog/posts/posts.json';
const POSTS_BASE = 'blog/posts/';

const blogList = document.getElementById('blog-list');

if (blogList) {
  fetch(POSTS_INDEX)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load posts index (${response.status})`);
      }
      return response.json();
    })
    .then(async (posts) => {
      if (!Array.isArray(posts) || !posts.length) {
        blogList.innerHTML = '<li>No posts yet.</li>';
        return;
      }
      blogList.innerHTML = '';
      for (const post of posts) {
        const item = document.createElement('li');
        const title = document.createElement('h3');
        title.textContent = post.title || post.slug;
        item.appendChild(title);

        if (post.date) {
          const meta = document.createElement('p');
          meta.className = 'blog-meta';
          meta.textContent = new Date(post.date).toLocaleDateString(undefined, {
            year: 'numeric', month: 'long', day: 'numeric',
          });
          item.appendChild(meta);
        }

        try {
          const markdown = await fetch(`${POSTS_BASE}${post.file}`).then((res) => {
            if (!res.ok) throw new Error(`Missing post ${post.file}`);
            return res.text();
          });
          const article = document.createElement('div');
          article.innerHTML = window.marked ? window.marked.parse(markdown) : markdown;
          item.appendChild(article);
        } catch (error) {
          const errorText = document.createElement('p');
          errorText.textContent = `Could not load this post (${error.message}).`;
          item.appendChild(errorText);
        }

        blogList.appendChild(item);
      }
    })
    .catch((error) => {
      console.error(error);
      blogList.innerHTML = '<li>Could not load posts. Please check your files and try again.</li>';
    });
}
