# Website Warmer Script

Questo script Node.js in TypeScript è progettato per effettuare il "warming" (riscaldamento) delle cache di un sito web, richiamando in parallelo una lista di URL ottenuti da un file di testo o da una Sitemap XML.

Lo script supporta la gestione della concorrenza, timeout personalizzabili e diversi metodi HTTP.

## Prerequisiti

Assicurati di avere Node.js installato. Lo script utilizza `ts-node` per l'esecuzione diretta del codice TypeScript e la libreria `xml2js` per il parsing delle sitemap.

Le dipendenze necessarie sono già presenti nel `package.json` del progetto. Per installarle, esegui:

```bash
npm install
```

## Utilizzo

Lo script può essere lanciato tramite terminale utilizzando `npx ts-node`:

```bash
npx ts-node index.ts [opzioni]
```

### Parametri Disponibili

| Parametro | Descrizione | Default |
|-----------|-------------|---------|
| `--list` | Percorso del file di testo contenente la lista di URL (uno per riga). | - |
| `--sitemapxml` | URL di una Sitemap XML (supporta anche Sitemap Index). | - |
| `--sitemapxml-recursive` | Uno o più URL di Sitemap XML index (separati da spazio). | - |
| `--concurrency` | Numero di richieste HTTP contemporanee. | `5` |
| `--timeout` | Tempo massimo di attesa per ogni richiesta (in millisecondi). | `10000` (10s) |
| `--method` | Metodo HTTP da utilizzare per le richieste (GET, POST, HEAD, ecc.). | `GET` |

**Nota:** È obbligatorio fornire almeno uno tra `--list`, `--sitemapxml` o `--sitemapxml-recursive`. Se vengono forniti più parametri, gli URL verranno uniti e i duplicati rimossi automaticamente.

## Esempi di Utilizzo

### 1. Warming da una lista di URL in un file
Crea un file (es. `urls.txt`) con un URL per riga. Le righe che iniziano con `#` o le righe vuote verranno ignorate.

```bash
npx ts-node index.ts --list urls.txt
```

### 2. Warming da una Sitemap XML
Recupera tutti gli URL definiti in una sitemap (anche se è un indice di sitemap che punta ad altre sitemap).

```bash
npx ts-node index.ts --sitemapxml https://www.example.com/sitemap.xml
```

### 3. Configurazione avanzata (Concorrenza e Timeout)
Esegue 10 richieste contemporanee con un timeout di 5 secondi:

```bash
npx ts-node index.ts --sitemapxml https://www.example.com/sitemap.xml --concurrency 10 --timeout 5000
```

### 4. Utilizzo di un metodo HTTP differente
Se vuoi solo testare la raggiungibilità senza scaricare il corpo della pagina (se il server lo supporta):

```bash
npx ts-node index.ts --list urls.txt --method HEAD
```

### 5. Combinazione di file e sitemap
```bash
npx ts-node index.ts --list urls.txt --sitemapxml https://www.example.com/sitemap.xml --concurrency 20
```

### 6. Sitemap XML Ricorsive (più lingue)
Recupera le URL da uno o più indici di sitemap XML (utile per gestire più lingue o indici complessi).

```bash
npx ts-node index.ts --sitemapxml-recursive https://example.com/sitemap_it.xml https://example.com/sitemap_en.xml --concurrency 10
```

```bash
npx ts-node index.ts --sitemapxml-recursive https://www.sdabocconi.it/it/sitemap.xml https://www.sdabocconi.it/en/sitemap.xml --concurrency 10
```

## Output dei Risultati

Lo script mostra il progresso in tempo reale sulla console e salva i risultati in un file di log all'interno della cartella `warmer/` (che viene creata automaticamente se non esiste).

Il nome del file di log segue il formato: `warmer_results_YYYY-MM-DDTHH-mm-ss-sssZ.log`.

### Formato del Log:
Ogni riga del file di log riporta lo stato HTTP (o l'errore) seguito dal tempo di risposta e dall'URL:

```text
200 | 150ms | https://www.example.com/pagina-1
200 | 320ms | https://www.example.com/pagina-2
404 | 45ms | https://www.example.com/pagina-non-esistente
TIMEOUT | 10000ms | https://www.example.com/pagina-lenta
ERROR | 12ms | https://www.url-non-valido.test
```

Al termine dell'esecuzione verrà visualizzato un riepilogo finale:
- Tempo totale di esecuzione.
- Numero totale di URL processati.
- Conteggio di successi, errori e timeout.
- Tempo di risposta medio per le richieste andate a buon fine.
