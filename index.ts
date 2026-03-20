#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import * as xml2js from 'xml2js';
import { Agent, setGlobalDispatcher } from 'undici';

/**
 * Script Node.js in TypeScript per richiamare pagine web da una lista o da una sitemap XML.
 * 
 * Utilizzo:
 * npx github:andrea-nigro/warmer [--list <file_url>] [--sitemapxml <sitemap_url>] [--sitemapxml-recursive <sitemap_url1,sitemap_url2,...>] [--concurrency <n>] [--timeout <ms>] [--method <GET|POST|...>] [--insecure]
 */

async function fetchSitemapUrls(sitemapUrl: string, timeoutMs: number, insecure: boolean = false): Promise<string[]> {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const fetchOptions: any = { signal: controller.signal };
        if (insecure) {
            fetchOptions.dispatcher = new Agent({
                connect: {
                    rejectUnauthorized: false
                }
            });
        }

        const response = await fetch(sitemapUrl, fetchOptions);
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const xml = await response.text();
        const result = await xml2js.parseStringPromise(xml);
        
        const urls: string[] = [];
        
        if (result.urlset && result.urlset.url) {
            for (const entry of result.urlset.url) {
                if (entry.loc && entry.loc[0]) {
                    urls.push(entry.loc[0].trim());
                }
            }
        } else if (result.sitemapindex && result.sitemapindex.sitemap) {
            // Se è un indice di sitemap, potremmo volerle processare ricorsivamente, 
            // ma per ora limitiamoci a estrarre quelle presenti.
            console.log('Rilevato indice di sitemap. Estrazione sitemap figlie...');
            for (const entry of result.sitemapindex.sitemap) {
                if (entry.loc && entry.loc[0]) {
                    const subUrls = await fetchSitemapUrls(entry.loc[0].trim(), timeoutMs, insecure);
                    urls.push(...subUrls);
                }
            }
        }
        
        return urls;
    } catch (error: any) {
        console.error(`Errore durante il recupero della sitemap (${sitemapUrl}): ${error.message}`);
        return [];
    }
}

async function main() {
    const args = process.argv.slice(2);

    const getArgValue = (flag: string): string | undefined => {
        const index = args.indexOf(flag);
        if (index !== -1 && index + 1 < args.length) {
            return args[index + 1];
        }
        return undefined;
    };

    const getArgValues = (flag: string): string[] => {
        const values: string[] = [];
        let index = args.indexOf(flag);
        while (index !== -1) {
            if (index + 1 < args.length && !args[index + 1].startsWith('--')) {
                // Supporta sia --flag val1 --flag val2 che --flag val1 val2 val3 (fino al prossimo flag)
                let nextIndex = index + 1;
                while (nextIndex < args.length && !args[nextIndex].startsWith('--')) {
                    values.push(args[nextIndex]);
                    nextIndex++;
                }
            }
            index = args.indexOf(flag, index + 1);
        }
        return values;
    };

    const filePath = getArgValue('--list');
    const sitemapUrl = getArgValue('--sitemapxml');
    const sitemapRecursiveUrls = getArgValues('--sitemapxml-recursive');
    const concurrencyStr = getArgValue('--concurrency');
    const timeoutStr = getArgValue('--timeout');
    const methodStr = getArgValue('--method');
    const insecure = args.includes('--insecure');

    if (args.includes('--help') || args.includes('-h') || (!filePath && !sitemapUrl && sitemapRecursiveUrls.length === 0)) {
        console.log('Utilizzo: npx github:andrea-nigro/warmer [--list <file_url>] [--sitemapxml <sitemap_url>] [--sitemapxml-recursive <sitemap_url1> <sitemap_url2> ...] [--concurrency <n>] [--timeout <ms>] [--method <GET|POST|...>] [--insecure]');
        console.log('\nParametri:');
        console.log('  --list <file>               File di testo con lista di URL (uno per riga)');
        console.log('  --sitemapxml <url>          URL di una sitemap XML');
        console.log('  --sitemapxml-recursive <urls> Uno o più URL di sitemap (anche indici) separati da spazio');
        console.log('  --concurrency <n>           Numero di richieste simultanee (default: 5)');
        console.log('  --timeout <ms>              Timeout per singola richiesta in ms (default: 10000)');
        console.log('  --method <GET|HEAD|...>     Metodo HTTP da usare (default: GET)');
        console.log('  --insecure                  Disabilita il controllo dei certificati SSL');
        console.log('\nEsempi:');
        console.log('  npx github:andrea-nigro/warmer --list urls.txt --concurrency 5');
        console.log('  npx github:andrea-nigro/warmer --sitemapxml https://example.com/sitemap.xml');
        console.log('  npx github:andrea-nigro/warmer --sitemapxml-recursive https://example.com/s1.xml https://example.com/s2.xml');
        process.exit(0);
    }

    const concurrency = parseInt(concurrencyStr || '5', 10);
    const timeoutMs = parseInt(timeoutStr || '10000', 10);
    const method = (methodStr || 'GET').toUpperCase();

    let urls: string[] = [];

    if (filePath) {
        if (!fs.existsSync(filePath)) {
            console.error(`Errore: Il file "${filePath}" non esiste.`);
            process.exit(1);
        }
        const fileUrls = fs.readFileSync(filePath, 'utf-8')
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0 && !line.startsWith('#'));
        urls.push(...fileUrls);
    }

    if (sitemapUrl) {
        console.log(`Recupero URL dalla sitemap: ${sitemapUrl}...`);
        const sitemapUrls = await fetchSitemapUrls(sitemapUrl, timeoutMs, insecure);
        urls.push(...sitemapUrls);
    }

    for (const sUrl of sitemapRecursiveUrls) {
        console.log(`Recupero ricorsivo URL dalla sitemap: ${sUrl}...`);
        const sitemapUrls = await fetchSitemapUrls(sUrl, timeoutMs, insecure);
        urls.push(...sitemapUrls);
    }

    // Rimuovi duplicati se presenti
    urls = [...new Set(urls)];

    if (urls.length === 0) {
        console.log('Nessun URL trovato da processare.');
        return;
    }

    const outputFileName = `warmer_results_${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
    const outputDir = path.resolve(process.cwd(), 'warmer');
    if (!fs.existsSync(outputDir)) {
        try {
            fs.mkdirSync(outputDir, { recursive: true });
        } catch (err: any) {
            console.error(`Errore: Impossibile creare la cartella di output "${outputDir}": ${err.message}`);
            process.exit(1);
        }
    }
    const outputPath = path.resolve(outputDir, outputFileName);
    const outputStream = fs.createWriteStream(outputPath);

    console.log(`Inizio warming di ${urls.length} URL...`);
    console.log(`Configurazione: Concorrenza=${concurrency}, Timeout=${timeoutMs}ms, Metodo=${method}, Insecure=${insecure}`);
    console.log(`Output in: ${outputPath}\n`);

    let currentIndex = 0;
    let totalSuccessTime = 0;
    let successCount = 0;
    let errorCount = 0;
    let timeoutCount = 0;
    const startTimeOverall = performance.now();

    const runWorker = async () => {
        const agent = insecure ? new Agent({
            connect: {
                rejectUnauthorized: false
            }
        }) : undefined;

        while (currentIndex < urls.length) {
            const urlIndex = currentIndex++;
            const url = urls[urlIndex];
            
            const startTime = performance.now();
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

                const fetchOptions: any = {
                    method: method,
                    signal: controller.signal
                };
                if (agent) {
                    fetchOptions.dispatcher = agent;
                }

                const response = await fetch(url, fetchOptions);
                
                clearTimeout(timeoutId);
                const endTime = performance.now();
                const duration = Math.round(endTime - startTime);
                
                totalSuccessTime += duration;
                successCount++;

                const statusLine = `${response.status} | ${duration}ms | ${url}`;
                console.log(`[${urlIndex + 1}/${urls.length}] ${statusLine}`);
                outputStream.write(statusLine + '\n');
            } catch (error: any) {
                const endTime = performance.now();
                const duration = Math.round(endTime - startTime);
                
                let status = 'ERROR';
                if (error.name === 'AbortError') {
                    status = 'TIMEOUT';
                    timeoutCount++;
                } else {
                    errorCount++;
                }
                const statusLine = `${status} | ${duration}ms | ${url}`;
                console.error(`[${urlIndex + 1}/${urls.length}] ${statusLine} - ${error.message}`);
                outputStream.write(statusLine + '\n');
            }
        }
    };

    const workerCount = Math.min(concurrency, urls.length);
    const workers = Array.from({ length: workerCount }, () => runWorker());
    
    await Promise.all(workers);

    const endTimeOverall = performance.now();
    const totalDuration = ((endTimeOverall - startTimeOverall) / 1000).toFixed(2);
    const avgTime = successCount > 0 ? (totalSuccessTime / successCount).toFixed(2) : '0';

    outputStream.end();

    console.log(`\n--- Riepilogo Finale ---`);
    console.log(`Tempo totale esecuzione: ${totalDuration}s`);
    console.log(`URL processati: ${urls.length}`);
    console.log(`Successi: ${successCount}`);
    console.log(`Errori: ${errorCount}`);
    console.log(`Timeout: ${timeoutCount}`);
    if (successCount > 0) {
        console.log(`Tempo di risposta medio (successi): ${avgTime}ms`);
    }
    console.log(`------------------------`);
    console.log(`\nCompletato. Risultati salvati in ${outputPath}`);
}

main()
    .catch(err => {
    console.error('Errore fatale:', err);
    process.exit(1);
});
