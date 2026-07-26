# Dr. Jorge Parra — personal website

Static migration of `jorpago2.blogs.uv.es`, prepared for publication at
`https://www.uv.es/jorpago2/`.

## Update and build

```text
npm run import   # refresh pages and images from WordPress
npm run build    # create publish/jorpago2
npm test         # verify links, images, metadata and routes
```

Upload the contents of `publish/jorpago2/` to the UV web directory assigned to
`/jorpago2/`. The site does not require a database, PHP, cookies or JavaScript.

Content is stored in `content/pages/`; presentation lives in `src/style.css`.
