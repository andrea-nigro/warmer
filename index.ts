#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import * as xml2js from 'xml2js';

/**
 * Script Node.js in TypeScript per richiamare pagine web da una lista o da una sitemap XML.
 * 
 * Utilizzo:
 * npx github:andrea-nigro/warmer [--list <file_url>] [--sitemapxml <sitemap_url>] [--sitemapxml-recursive <sitemap_url1,sitemap_url2,...>] [--concurrency <n>] [--timeout <ms>] [--method <GET|POST|...>]
 */

async function fetchSitemapUrls(sitemapUrl: string, timeoutMs: number): Promise<string[]> {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch(sitemapUrl, { signal: controller.signal });
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
                    const subUrls = await fetchSitemapUrls(entry.loc[0].trim(), timeoutMs);
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

    if (!filePath && !sitemapUrl && sitemapRecursiveUrls.length === 0) {
        console.log('Utilizzo: npx github:andrea-nigro/warmer [--list <file_url>] [--sitemapxml <sitemap_url>] [--sitemapxml-recursive <sitemap_url1> <sitemap_url2> ...] [--concurrency <n>] [--timeout <ms>] [--method <GET|POST|...>]');
        console.log('Esempio file: npx github:andrea-nigro/warmer --list urls.txt --concurrency 5');
        console.log('Esempio sitemap: npx github:andrea-nigro/warmer --sitemapxml https://example.com/sitemap.xml --concurrency 10');
        console.log('Esempio sitemap ricorsiva: npx github:andrea-nigro/warmer --sitemapxml-recursive https://example.com/sitemap_index.xml --concurrency 10');
        process.exit(1);
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
        const sitemapUrls = await fetchSitemapUrls(sitemapUrl, timeoutMs);
        urls.push(...sitemapUrls);
    }

    for (const sUrl of sitemapRecursiveUrls) {
        console.log(`Recupero ricorsivo URL dalla sitemap: ${sUrl}...`);
        const sitemapUrls = await fetchSitemapUrls(sUrl, timeoutMs);
        urls.push(...sitemapUrls);
    }

    // Rimuovi duplicati se presenti
    urls = [...new Set(urls)];

    if (urls.length === 0) {
        console.log('Nessun URL trovato da processare.');
        return;
    }

    const outputFileName = `warmer_results_${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
    const outputDir = path.resolve(process.cwd(), 'output');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    const outputPath = path.resolve(outputDir, outputFileName);
    const outputStream = fs.createWriteStream(outputPath);

    console.log(`Inizio warming di ${urls.length} URL...`);
    console.log(`Configurazione: Concorrenza=${concurrency}, Timeout=${timeoutMs}ms, Metodo=${method}`);
    console.log(`Output in: ${outputPath}\n`);

    let currentIndex = 0;
    let totalSuccessTime = 0;
    let successCount = 0;
    let errorCount = 0;
    let timeoutCount = 0;
    const startTimeOverall = performance.now();

    const runWorker = async () => {
        while (currentIndex < urls.length) {
            const urlIndex = currentIndex++;
            const url = urls[urlIndex];
            
            const startTime = performance.now();
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

                const response = await fetch(url, {
                    method: method,
                    signal: controller.signal
                });
                
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
