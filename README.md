# Zupulse

Zupulse is a local-first sheet music viewer and practice workspace. It helps musicians keep a device-local score library, read and play scores, slow down difficult passages, loop sections, and resume practice where they left off.

The project currently supports Guitar Pro, MusicXML, and compressed MusicXML (`.mxl`) files. It also includes a dedicated Studio for analyzing, correcting, previewing, and exporting chord symbols without modifying the imported source score.

Zupulse is being developed across three application surfaces:

- a browser demo backed by IndexedDB;
- an Electron desktop app backed by SQLite and managed local files;
- an experimental native iPad shell that shares the core viewer experience.

All score files and practice data stay on the current device. Cloud sync is not currently part of the product.

## Try Zupulse

Try the official hosted version at [zupulse.vercel.app](https://zupulse.vercel.app/).

You can begin with one of the bundled sample scores or import a Guitar Pro, MusicXML, or MXL file from your computer.

## Development

The repository uses Node.js 22 and pnpm 9.3.0. Install the dependencies first:

```bash
pnpm install --frozen-lockfile
```

Run the browser demo:

```bash
pnpm demo:dev
```

Then open [http://localhost:5173](http://localhost:5173).

Run the Electron desktop application:

```bash
pnpm desktop:dev

# another shell
pnpm desktop:start
```

Run the fast verification suite with:

```bash
pnpm verify:fast
```

For the architecture and product documentation, start with [`docs/architecture/README.md`](docs/architecture/README.md) and [`CONTEXT.md`](CONTEXT.md).
