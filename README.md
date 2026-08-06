# Dr. Jorge Parra — personal website

Static migration of `jorpago2.blogs.uv.es`, prepared for publication at
`https://www.uv.es/jorpago2/`.

## Update and build

```text
pnpm build    # create publish/jorpago2
pnpm test     # verify links, images, metadata and routes
```

Upload the contents of `publish/jorpago2/` to the UV web directory assigned to
`/jorpago2/`. The site does not require a database, PHP or cookies. JavaScript
is limited to navigation and carousels.

## Deploy to the UV

Install the SFTP dependency once:

```powershell
py -m pip install --user paramiko==4.0.0
```

Then build, test, back up, publish and verify the website with:

```powershell
py scripts/deploy_uv.py
```

The command reads the `disco.uv.es` credential from Windows Credential Manager;
the password is never stored in the repository or printed in the terminal.

GitHub Pages is a temporary preview and is built with `SITE_PREVIEW=true`, which
keeps the canonical URLs on the UV domain and prevents indexing of the mirror.

Enabled languages are declared in `content/locales.json`. Shared interface text
lives in `content/i18n/<locale>.json`; page metadata and HTML fragments live in
`content/pages/<locale>/`. Publications, courses, supervised projects and curated
resources are maintained once in `content/data/` and rendered into every language.
Presentation lives in `src/style.css`.
Unused WordPress media is retained in `archive/wordpress-media/` and is not published.
