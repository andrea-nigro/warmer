#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const xml2js = __importStar(require("xml2js"));
const undici_1 = require("undici");
/**
 * Script Node.js in TypeScript per richiamare pagine web da una lista o da una sitemap XML.
 *
 * Utilizzo:
 * npx github:andrea-nigro/warmer [--list <file_url>] [--sitemapxml <sitemap_url>] [--sitemapxml-recursive <sitemap_url1,sitemap_url2,...>] [--concurrency <n>] [--timeout <ms>] [--method <GET|POST|...>] [--insecure]
 */
async function fetchSitemapUrls(sitemapUrl, timeoutMs, insecure = false) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        const fetchOptions = { signal: controller.signal };
        if (insecure) {
            fetchOptions.dispatcher = new undici_1.Agent({
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
        const urls = [];
        if (result.urlset && result.urlset.url) {
            for (const entry of result.urlset.url) {
                if (entry.loc && entry.loc[0]) {
                    urls.push(entry.loc[0].trim());
                }
            }
        }
        else if (result.sitemapindex && result.sitemapindex.sitemap) {
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
    }
    catch (error) {
        console.error(`Errore durante il recupero della sitemap (${sitemapUrl}): ${error.message}`);
        return [];
    }
}
async function main() {
    const args = process.argv.slice(2);
    const getArgValue = (flag) => {
        const index = args.indexOf(flag);
        if (index !== -1 && index + 1 < args.length) {
            return args[index + 1];
        }
        return undefined;
    };
    const getArgValues = (flag) => {
        const values = [];
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
    const replaceHostname = getArgValue('--replace-hostname');
    const concurrencyStr = getArgValue('--concurrency');
    const timeoutStr = getArgValue('--timeout');
    const methodStr = getArgValue('--method');
    const insecure = args.includes('--insecure');
    if (args.includes('--help') || args.includes('-h') || (!filePath && !sitemapUrl && sitemapRecursiveUrls.length === 0)) {
        console.log('Utilizzo: npx github:andrea-nigro/warmer [--list <file_url>] [--sitemapxml <sitemap_url>] [--sitemapxml-recursive <sitemap_url1> <sitemap_url2> ...] [--replace-hostname <new_hostname>] [--concurrency <n>] [--timeout <ms>] [--method <GET|POST|...>] [--insecure]');
        console.log('\nParametri:');
        console.log('  --list <file>               File di testo con lista di URL (uno per riga)');
        console.log('  --sitemapxml <url>          URL di una sitemap XML');
        console.log('  --sitemapxml-recursive <urls> Uno o più URL di sitemap (anche indici) separati da spazio');
        console.log('  --replace-hostname <host>   Sostituisce l\'hostname negli URL (es: staging.example.com)');
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
    let urls = [];
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
    // Sostituzione hostname se richiesto
    if (replaceHostname) {
        console.log(`Sostituzione hostname con: ${replaceHostname}...`);
        urls = urls.map(u => {
            try {
                const parsedUrl = new URL(u);
                parsedUrl.hostname = replaceHostname;
                return parsedUrl.toString();
            }
            catch (e) {
                return u; // Se non è un URL valido, lascia così com'è
            }
        });
    }
    if (urls.length === 0) {
        console.log('Nessun URL trovato da processare.');
        return;
    }
    const outputFileName = `warmer_results_${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
    const outputDir = path.resolve(process.cwd(), 'warmer');
    if (!fs.existsSync(outputDir)) {
        try {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        catch (err) {
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
        const agent = insecure ? new undici_1.Agent({
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
                const fetchOptions = {
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
            }
            catch (error) {
                const endTime = performance.now();
                const duration = Math.round(endTime - startTime);
                let status = 'ERROR';
                if (error.name === 'AbortError') {
                    status = 'TIMEOUT';
                    timeoutCount++;
                }
                else {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFDQSx1Q0FBeUI7QUFDekIsMkNBQTZCO0FBQzdCLCtDQUFpQztBQUNqQyxtQ0FBb0Q7QUFFcEQ7Ozs7O0dBS0c7QUFFSCxLQUFLLFVBQVUsZ0JBQWdCLENBQUMsVUFBa0IsRUFBRSxTQUFpQixFQUFFLFdBQW9CLEtBQUs7SUFDNUYsSUFBSSxDQUFDO1FBQ0QsTUFBTSxVQUFVLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQUN6QyxNQUFNLFNBQVMsR0FBRyxVQUFVLENBQUMsR0FBRyxFQUFFLENBQUMsVUFBVSxDQUFDLEtBQUssRUFBRSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBRWxFLE1BQU0sWUFBWSxHQUFRLEVBQUUsTUFBTSxFQUFFLFVBQVUsQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUN4RCxJQUFJLFFBQVEsRUFBRSxDQUFDO1lBQ1gsWUFBWSxDQUFDLFVBQVUsR0FBRyxJQUFJLGNBQUssQ0FBQztnQkFDaEMsT0FBTyxFQUFFO29CQUNMLGtCQUFrQixFQUFFLEtBQUs7aUJBQzVCO2FBQ0osQ0FBQyxDQUFDO1FBQ1AsQ0FBQztRQUVELE1BQU0sUUFBUSxHQUFHLE1BQU0sS0FBSyxDQUFDLFVBQVUsRUFBRSxZQUFZLENBQUMsQ0FBQztRQUN2RCxZQUFZLENBQUMsU0FBUyxDQUFDLENBQUM7UUFFeEIsSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNmLE1BQU0sSUFBSSxLQUFLLENBQUMsdUJBQXVCLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBQzlELENBQUM7UUFFRCxNQUFNLEdBQUcsR0FBRyxNQUFNLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNsQyxNQUFNLE1BQU0sR0FBRyxNQUFNLE1BQU0sQ0FBQyxrQkFBa0IsQ0FB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LENBQUMsZ0JBQWdCLEdBQUcsWUFBWSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUM7SUFFdEYsWUFBWSxDQUFDLEdBQUcsRUFBRSxDQUFDO0lBRW5CLE9BQU8sQ0FBQyxHQUFHLENBQUMsNEJBQTRCLENBQUMsQ0FBQztJQUMxQyxPQUFPLENBQUMsR0FBRyxDQUFDLDRCQUE0QixhQUFhLEdBQUcsQ0FBQyxDQUFDO0lBQzFELE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW1CLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO0lBQzlDLE9BQU8sQ0FBQyxHQUFHLENBQUMsYUFBYSxZQUFZLEVBQUUsQ0FBQyxDQUFDO0lBQ3pDLE9BQU8sQ0FBQyxHQUFHLENBQUMsV0FBVyxVQUFVLEVBQUUsQ0FBQyxDQUFDO0lBQ3JDLE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWSxZQUFZLEVBQUUsQ0FBQyxDQUFDO0lBQ3hDLElBQUksWUFBWSxHQUFHLENBQUMsRUFBRSxDQUFDO1FBQ25CLE9BQU8sQ0FBQyxHQUFHLENBQUMsdUNBQXVDLE9BQU8sSUFBSSxDQUFDLENBQUM7SUFDcEUsQ0FBQztJQUNELE9BQU8sQ0FBQyxHQUFHLENBQUMsMEJBQTBCLENBQUMsQ0FBQztJQUN4QyxPQUFPLENBQUMsR0FBRyxDQUFDLHNDQUFzQyxVQUFVLEVBQUUsQ0FBQyxDQUFDO0FBQ3BFLENBQUM7QUFFRCxJQUFJLEVBQUU7S0FDRCxLQUFLLENBQUMsR0FBRyxDQUFDLEVBQUU7SUFDYixPQUFPLENBQUMsS0FBSyxDQUFDLGdCQUFnQixFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBQ3JDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDcEIsQ0FBQyxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIjIS91c3IvYmluL2VudiBub2RlXG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0ICogYXMgeG1sMmpzIGZyb20gJ3htbDJqcyc7XG5pbXBvcnQgeyBBZ2VudCwgc2V0R2xvYmFsRGlzcGF0Y2hlciB9IGZyb20gJ3VuZGljaSc7XG5cbi8qKlxuICogU2NyaXB0IE5vZGUuanMgaW4gVHlwZVNjcmlwdCBwZXIgcmljaGlhbWFyZSBwYWdpbmUgd2ViIGRhIHVuYSBsaXN0YSBvIGRhIHVuYSBzaXRlbWFwIFhNTC5cbiAqIFxuICogVXRpbGl6em86XG4gKiBucHggZ2l0aHViOmFuZHJlYS1uaWdyby93YXJtZXIgWy0tbGlzdCA8ZmlsZV91cmw+XSBbLS1zaXRlbWFweG1sIDxzaXRlbWFwX3VybD5dIFstLXNpdGVtYXB4bWwtcmVjdXJzaXZlIDxzaXRlbWFwX3VybDEsc2l0ZW1hcF91cmwyLC4uLj5dIFstLWNvbmN1cnJlbmN5IDxuPl0gWy0tdGltZW91dCA8bXM+XSBbLS1tZXRob2QgPEdFVHxQT1NUfC4uLj5dIFstLWluc2VjdXJlXVxuICovXG5cbmFzeW5jIGZ1bmN0aW9uIGZldGNoU2l0ZW1hcFVybHMoc2l0ZW1hcFVybDogc3RyaW5nLCB0aW1lb3V0TXM6IG51bWJlciwgaW5zZWN1cmU6IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8c3RyaW5nW10+IHtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCBjb250cm9sbGVyID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xuICAgICAgICBjb25zdCB0aW1lb3V0SWQgPSBzZXRUaW1lb3V0KCgpID0+IGNvbnRyb2xsZXIuYWJvcnQoKSwgdGltZW91dE1zKTtcblxuICAgICAgICBjb25zdCBmZXRjaE9wdGlvbnM6IGFueSA9IHsgc2lnbmFsOiBjb250cm9sbGVyLnNpZ25hbCB9O1xuICAgICAgICBpZiAoaW5zZWN1cmUpIHtcbiAgICAgICAgICAgIGZldGNoT3B0aW9ucy5kaXNwYXRjaGVyID0gbmV3IEFnZW50KHtcbiAgICAgICAgICAgICAgICBjb25uZWN0OiB7XG4gICAgICAgICAgICAgICAgICAgIHJlamVjdFVuYXV0aG9yaXplZDogZmFsc2VcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goc2l0ZW1hcFVybCwgZmV0Y2hPcHRpb25zKTtcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXRJZCk7XG5cbiAgICAgICAgaWYgKCFyZXNwb25zZS5vaykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBIVFRQIGVycm9yISBzdGF0dXM6ICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgeG1sID0gYXdhaXQgcmVzcG9uc2UudGV4dCgpO1xuICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB4bWwyanMucGFyc2VTdHJpbmdQcm9taXNlKHhtbCk7XG4gICAgICAgIFxuICAgICAgICBjb25zdCB1cmxzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICBcbiAgICAgICAgaWYgKHJlc3VsdC51cmxzZXQgJiYgcmVzdWx0LnVybHNldC51cmwpIHtcbiAgICAgICAgICAgIGZvciAoY29uc3QgZW50cnkgb2YgcmVzdWx0LnVybHNldC51cmwpIHtcbiAgICAgICAgICAgICAgICBpZiAoZW50cnkubG9jICYmIGVudHJ5LmxvY1swXSkge1xuICAgICAgICAgICAgICAgICAgICB1cmxzLnB1c2goZW50cnkubG9jWzBdLnRyaW0oKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHJlc3VsdC5zaXRlbWFwaW5kZXggJiYgcmVzdWx0LnNpdGVtYXBpbmRleC5zaXRlbWFwKSB7XG4gICAgICAgICAgICAvLyBTZSDDqCB1biBpbmRpY2UgZGkgc2l0ZW1hcCwgcG90cmVtbW8gdm9sZXJsZSBwcm9jZXNzYXJlIHJpY29yc2l2YW1lbnRlLCBcbiAgICAgICAgICAgIC8vIG1hIHBlciBvcmEgbGltaXRpYW1vY2kgYSBlc3RyYXJyZSBxdWVsbGUgcHJlc2VudGkuXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnUmlsZXZhdG8gaW5kaWNlIGRpIHNpdGVtYXAuIEVzdHJhemlvbmUgc2l0ZW1hcCBmaWdsaWUuLi4nKTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgZW50cnkgb2YgcmVzdWx0LnNpdGVtYXBpbmRleC5zaXRlbWFwKSB7XG4gICAgICAgICAgICAgICAgaWYgKGVudHJ5LmxvYyAmJiBlbnRyeS5sb2NbMF0pIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3ViVXJscyA9IGF3YWl0IGZldGNoU2l0ZW1hcFVybHMoZW50cnkubG9jWzBdLnRyaW0oKSwgdGltZW91dE1zLCBpbnNlY3VyZSk7XG4gICAgICAgICAgICAgICAgICAgIHVybHMucHVzaCguLi5zdWJVcmxzKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHJldHVybiB1cmxzO1xuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihgRXJyb3JlIGR1cmFudGUgaWwgcmVjdXBlcm8gZGVsbGEgc2l0ZW1hcCAoJHtzaXRlbWFwVXJsfSk6ICR7ZXJyb3IubWVzc2FnZX1gKTtcbiAgICAgICAgcmV0dXJuIFtdO1xuICAgIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gbWFpbigpIHtcbiAgICBjb25zdCBhcmdzID0gcHJvY2Vzcy5hcmd2LnNsaWNlKDIpO1xuXG4gICAgY29uc3QgZ2V0QXJnVmFsdWUgPSAoZmxhZzogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkID0+IHtcbiAgICAgICAgY29uc3QgaW5kZXggPSBhcmdzLmluZGV4T2YoZmxhZyk7XG4gICAgICAgIGlmIChpbmRleCAhPT0gLTEgJiYgaW5kZXggKyAxIDwgYXJncy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHJldHVybiBhcmdzW2luZGV4ICsgMV07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9O1xuXG4gICAgY29uc3QgZ2V0QXJnVmFsdWVzID0gKGZsYWc6IHN0cmluZyk6IHN0cmluZ1tdID0+IHtcbiAgICAgICAgY29uc3QgdmFsdWVzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICBsZXQgaW5kZXggPSBhcmdzLmluZGV4T2YoZmxhZyk7XG4gICAgICAgIHdoaWxlIChpbmRleCAhPT0gLTEpIHtcbiAgICAgICAgICAgIGlmIChpbmRleCArIDEgPCBhcmdzLmxlbmd0aCAmJiAhYXJnc1tpbmRleCArIDFdLnN0YXJ0c1dpdGgoJy0tJykpIHtcbiAgICAgICAgICAgICAgICAvLyBTdXBwb3J0YSBzaWEgLS1mbGFnIHZhbDEgLS1mbGFnIHZhbDIgY2hlIC0tZmxhZyB2YWwxIHZhbDIgdmFsMyAoZmlubyBhbCBwcm9zc2ltbyBmbGFnKVxuICAgICAgICAgICAgICAgIGxldCBuZXh0SW5kZXggPSBpbmRleCArIDE7XG4gICAgICAgICAgICAgICAgd2hpbGUgKG5leHRJbmRleCA8IGFyZ3MubGVuZ3RoICYmICFhcmdzW25leHRJbmRleF0uc3RhcnRzV2l0aCgnLS0nKSkge1xuICAgICAgICAgICAgICAgICAgICB2YWx1ZXMucHVzaChhcmdzW25leHRJbmRleF0pO1xuICAgICAgICAgICAgICAgICAgICBuZXh0SW5kZXgrKztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpbmRleCA9IGFyZ3MuaW5kZXhPZihmbGFnLCBpbmRleCArIDEpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB2YWx1ZXM7XG4gICAgfTtcblxuICAgIGNvbnN0IGZpbGVQYXRoID0gZ2V0QXJnVmFsdWUoJy0tbGlzdCcpO1xuICAgIGNvbnN0IHNpdGVtYXBVcmwgPSBnZXRBcmdWYWx1ZSgnLS1zaXRlbWFweG1sJyk7XG4gICAgY29uc3Qgc2l0ZW1hcFJlY3Vyc2l2ZVVybHMgPSBnZXRBcmdWYWx1ZXMoJy0tc2l0ZW1hcHhtbC1yZWN1cnNpdmUnKTtcbiAgICBjb25zdCByZXBsYWNlSG9zdG5hbWUgPSBnZXRBcmdWYWx1ZSgnLS1yZXBsYWNlLWhvc3RuYW1lJyk7XG4gICAgY29uc3QgY29uY3VycmVuY3lTdHIgPSBnZXRBcmdWYWx1ZSgnLS1jb25jdXJyZW5jeScpO1xuICAgIGNvbnN0IHRpbWVvdXRTdHIgPSBnZXRBcmdWYWx1ZSgnLS10aW1lb3V0Jyk7XG4gICAgY29uc3QgbWV0aG9kU3RyID0gZ2V0QXJnVmFsdWUoJy0tbWV0aG9kJyk7XG4gICAgY29uc3QgaW5zZWN1cmUgPSBhcmdzLmluY2x1ZGVzKCctLWluc2VjdXJlJyk7XG5cbiAgICBpZiAoYXJncy5pbmNsdWRlcygnLS1oZWxwJykgfHwgYXJncy5pbmNsdWRlcygnLWgnKSB8fCAoIWZpbGVQYXRoICYmICFzaXRlbWFwVXJsICYmIHNpdGVtYXBSZWN1cnNpdmVVcmxzLmxlbmd0aCA9PT0gMCkpIHtcbiAgICAgICAgY29uc29sZS5sb2coJ1V0aWxpenpvOiBucHggZ2l0aHViOmFuZHJlYS1uaWdyby93YXJtZXIgWy0tbGlzdCA8ZmlsZV91cmw+XSBbLS1zaXRlbWFweG1sIDxzaXRlbWFwX3VybD5dIFstLXNpdGVtYXB4bWwtcmVjdXJzaXZlIDxzaXRlbWFwX3VybDE+IDxzaXRlbWFwX3VybDI+IC4uLl0gWy0tcmVwbGFjZS1ob3N0bmFtZSA8bmV3X2hvc3RuYW1lPl0gWy0tY29uY3VycmVuY3kgPG4+XSBbLS10aW1lb3V0IDxtcz5dIFstLW1ldGhvZCA8R0VUfFBPU1R8Li4uPl0gWy0taW5zZWN1cmVdJyk7XG4gICAgICAgIGNvbnNvbGUubG9nKCdcXG5QYXJhbWV0cmk6Jyk7XG4gICAgICAgIGNvbnNvbGUubG9nKCcgIC0tbGlzdCA8ZmlsZT4gICAgICAgICAgICAgICBGaWxlIGRpIHRlc3RvIGNvbiBsaXN0YSBkaSBVUkwgKHVubyBwZXIgcmlnYSknKTtcbiAgICAgICAgY29uc29sZS5sb2coJyAgLS1zaXRlbWFweG1sIDx1cmw+ICAgICAgICAgIFVSTCBkaSB1bmEgc2l0ZW1hcCBYTUwnKTtcbiAgICAgICAgY29uc29sZS5sb2coJyAgLS1zaXRlbWFweG1sLXJlY3Vyc2l2ZSA8dXJscz4gVW5vIG8gcGnDuSBVUkwgZGkgc2l0ZW1hcCAoYW5jaGUgaW5kaWNpKSBzZXBhcmF0aSBkYSBzcGF6aW8nKTtcbiAgICAgICAgY29uc29sZS5sb2coJyAgLS1yZXBsYWNlLWhvc3RuYW1lIDxob3N0PiAgIFNvc3RpdHVpc2NlIGxcXCdob3N0bmFtZSBuZWdsaSBVUkwgKGVzOiBzdGFnaW5nLmV4YW1wbGUuY29tKScpO1xuICAgICAgICBjb25zb2xlLmxvZygnICAtLWNvbmN1cnJlbmN5IDxuPiAgICAgICAgICAgTnVtZXJvIGRpIHJpY2hpZXN0ZSBzaW11bHRhbmVlIChkZWZhdWx0OiA1KScpO1xuICAgICAgICBjb25zb2xlLmxvZygnICAtLXRpbWVvdXQgPG1zPiAgICAgICAgICAgICAgVGltZW91dCBwZXIgc2luZ29sYSByaWNoaWVzdGEgaW4gbXMgKGRlZmF1bHQ6IDEwMDAwKScpO1xuICAgICAgICBjb25zb2xlLmxvZygnICAtLW1ldGhvZCA8R0VUfEhFQUR8Li4uPiAgICAgTWV0b2RvIEhUVFAgZGEgdXNhcmUgKGRlZmF1bHQ6IEdFVCknKTtcbiAgICAgICAgY29uc29sZS5sb2coJyAgLS1pbnNlY3VyZSAgICAgICAgICAgICAgICAgIERpc2FiaWxpdGEgaWwgY29udHJvbGxvIGRlaSBjZXJ0aWZpY2F0aSBTU0wnKTtcbiAgICAgICAgY29uc29sZS5sb2coJ1xcbkVzZW1waTonKTtcbiAgICAgICAgY29uc29sZS5sb2coJyAgbnB4IGdpdGh1YjphbmRyZWEtbmlncm8vd2FybWVyIC0tbGlzdCB1cmxzLnR4dCAtLWNvbmN1cnJlbmN5IDUnKTtcbiAgICAgICAgY29uc29sZS5sb2coJyAgbnB4IGdpdGh1YjphbmRyZWEtbmlncm8vd2FybWVyIC0tc2l0ZW1hcHhtbCBodHRwczovL2V4YW1wbGUuY29tL3NpdGVtYXAueG1sJyk7XG4gICAgICAgIGNvbnNvbGUubG9nKCcgIG5weCBnaXRodWI6YW5kcmVhLW5pZ3JvL3dhcm1lciAtLXNpdGVtYXB4bWwtcmVjdXJzaXZlIGh0dHBzOi8vZXhhbXBsZS5jb20vczEueG1sIGh0dHBzOi8vZXhhbXBsZS5jb20vczIueG1sJyk7XG4gICAgICAgIHByb2Nlc3MuZXhpdCgwKTtcbiAgICB9XG5cbiAgICBjb25zdCBjb25jdXJyZW5jeSA9IHBhcnNlSW50KGNvbmN1cnJlbmN5U3RyIHx8ICc1JywgMTApO1xuICAgIGNvbnN0IHRpbWVvdXRNcyA9IHBhcnNlSW50KHRpbWVvdXRTdHIgfHwgJzEwMDAwJywgMTApO1xuICAgIGNvbnN0IG1ldGhvZCA9IChtZXRob2RTdHIgfHwgJ0dFVCcpLnRvVXBwZXJDYXNlKCk7XG5cbiAgICBsZXQgdXJsczogc3RyaW5nW10gPSBbXTtcblxuICAgIGlmIChmaWxlUGF0aCkge1xuICAgICAgICBpZiAoIWZzLmV4aXN0c1N5bmMoZmlsZVBhdGgpKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGBFcnJvcmU6IElsIGZpbGUgXCIke2ZpbGVQYXRofVwiIG5vbiBlc2lzdGUuYCk7XG4gICAgICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZmlsZVVybHMgPSBmcy5yZWFkRmlsZVN5bmMoZmlsZVBhdGgsICd1dGYtOCcpXG4gICAgICAgICAgICAuc3BsaXQoJ1xcbicpXG4gICAgICAgICAgICAubWFwKGxpbmUgPT4gbGluZS50cmltKCkpXG4gICAgICAgICAgICAuZmlsdGVyKGxpbmUgPT4gbGluZS5sZW5ndGggPiAwICYmICFsaW5lLnN0YXJ0c1dpdGgoJyMnKSk7XG4gICAgICAgIHVybHMucHVzaCguLi5maWxlVXJscyk7XG4gICAgfVxuXG4gICAgaWYgKHNpdGVtYXBVcmwpIHtcbiAgICAgICAgY29uc29sZS5sb2coYFJlY3VwZXJvIFVSTCBkYWxsYSBzaXRlbWFwOiAke3NpdGVtYXBVcmx9Li4uYCk7XG4gICAgICAgIGNvbnN0IHNpdGVtYXBVcmxzID0gYXdhaXQgZmV0Y2hTaXRlbWFwVXJscyhzaXRlbWFwVXJsLCB0aW1lb3V0TXMsIGluc2VjdXJlKTtcbiAgICAgICAgdXJscy5wdXNoKC4uLnNpdGVtYXBVcmxzKTtcbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IHNVcmwgb2Ygc2l0ZW1hcFJlY3Vyc2l2ZVVybHMpIHtcbiAgICAgICAgY29uc29sZS5sb2coYFJlY3VwZXJvIHJpY29yc2l2byBVUkwgZGFsbGEgc2l0ZW1hcDogJHtzVXJsfS4uLmApO1xuICAgICAgICBjb25zdCBzaXRlbWFwVXJscyA9IGF3YWl0IGZldGNoU2l0ZW1hcFVybHMoc1VybCwgdGltZW91dE1zLCBpbnNlY3VyZSk7XG4gICAgICAgIHVybHMucHVzaCguLi5zaXRlbWFwVXJscyk7XG4gICAgfVxuXG4gICAgLy8gUmltdW92aSBkdXBsaWNhdGkgc2UgcHJlc2VudGlcbiAgICB1cmxzID0gWy4uLm5ldyBTZXQodXJscyldO1xuXG4gICAgLy8gU29zdGl0dXppb25lIGhvc3RuYW1lIHNlIHJpY2hpZXN0b1xuICAgIGlmIChyZXBsYWNlSG9zdG5hbWUpIHtcbiAgICAgICAgY29uc29sZS5sb2coYFNvc3RpdHV6aW9uZSBob3N0bmFtZSBjb246ICR7cmVwbGFjZUhvc3RuYW1lfS4uLmApO1xuICAgICAgICB1cmxzID0gdXJscy5tYXAodSA9PiB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHBhcnNlZFVybCA9IG5ldyBVUkwodSk7XG4gICAgICAgICAgICAgICAgcGFyc2VkVXJsLmhvc3RuYW1lID0gcmVwbGFjZUhvc3RuYW1lO1xuICAgICAgICAgICAgICAgIHJldHVybiBwYXJzZWRVcmwudG9TdHJpbmcoKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdTsgLy8gU2Ugbm9uIMOoIHVuIFVSTCB2YWxpZG8sIGxhc2NpYSBjb3PDrCBjb20nw6hcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgaWYgKHVybHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKCdOZXNzdW4gVVJMIHRyb3ZhdG8gZGEgcHJvY2Vzc2FyZS4nKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IG91dHB1dEZpbGVOYW1lID0gYHdhcm1lcl9yZXN1bHRzXyR7bmV3IERhdGUoKS50b0lTT1N0cmluZygpLnJlcGxhY2UoL1s6Ll0vZywgJy0nKX0ubG9nYDtcbiAgICBjb25zdCBvdXRwdXREaXIgPSBwYXRoLnJlc29sdmUocHJvY2Vzcy5jd2QoKSwgJ3dhcm1lcicpO1xuICAgIGlmICghZnMuZXhpc3RzU3luYyhvdXRwdXREaXIpKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBmcy5ta2RpclN5bmMob3V0cHV0RGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICAgICAgfSBjYXRjaCAoZXJyOiBhbnkpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEVycm9yZTogSW1wb3NzaWJpbGUgY3JlYXJlIGxhIGNhcnRlbGxhIGRpIG91dHB1dCBcIiR7b3V0cHV0RGlyfVwiOiAke2Vyci5tZXNzYWdlfWApO1xuICAgICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICB9XG4gICAgfVxuICAgIGNvbnN0IG91dHB1dFBhdGggPSBwYXRoLnJlc29sdmUob3V0cHV0RGlyLCBvdXRwdXRGaWxlTmFtZSk7XG4gICAgY29uc3Qgb3V0cHV0U3RyZWFtID0gZnMuY3JlYXRlV3JpdGVTdHJlYW0ob3V0cHV0UGF0aCk7XG5cbiAgICBjb25zb2xlLmxvZyhgSW5pemlvIHdhcm1pbmcgZGkgJHt1cmxzLmxlbmd0aH0gVVJMLi4uYCk7XG4gICAgY29uc29sZS5sb2coYENvbmZpZ3VyYXppb25lOiBDb25jb3JyZW56YT0ke2NvbmN1cnJlbmN5fSwgVGltZW91dD0ke3RpbWVvdXRNc31tcywgTWV0b2RvPSR7bWV0aG9kfSwgSW5zZWN1cmU9JHtpbnNlY3VyZX1gKTtcbiAgICBjb25zb2xlLmxvZyhgT3V0cHV0IGluOiAke291dHB1dFBhdGh9XFxuYCk7XG5cbiAgICBsZXQgY3VycmVudEluZGV4ID0gMDtcbiAgICBsZXQgdG90YWxTdWNjZXNzVGltZSA9IDA7XG4gICAgbGV0IHN1Y2Nlc3NDb3VudCA9IDA7XG4gICAgbGV0IGVycm9yQ291bnQgPSAwO1xuICAgIGxldCB0aW1lb3V0Q291bnQgPSAwO1xuICAgIGNvbnN0IHN0YXJ0VGltZU92ZXJhbGwgPSBwZXJmb3JtYW5jZS5ub3coKTtcblxuICAgIGNvbnN0IHJ1bldvcmtlciA9IGFzeW5jICgpID0+IHtcbiAgICAgICAgY29uc3QgYWdlbnQgPSBpbnNlY3VyZSA/IG5ldyBBZ2VudCh7XG4gICAgICAgICAgICBjb25uZWN0OiB7XG4gICAgICAgICAgICAgICAgcmVqZWN0VW5hdXRob3JpemVkOiBmYWxzZVxuICAgICAgICAgICAgfVxuICAgICAgICB9KSA6IHVuZGVmaW5lZDtcblxuICAgICAgICB3aGlsZSAoY3VycmVudEluZGV4IDwgdXJscy5sZW5ndGgpIHtcbiAgICAgICAgICAgIGNvbnN0IHVybEluZGV4ID0gY3VycmVudEluZGV4Kys7XG4gICAgICAgICAgICBjb25zdCB1cmwgPSB1cmxzW3VybEluZGV4XTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgY29uc3Qgc3RhcnRUaW1lID0gcGVyZm9ybWFuY2Uubm93KCk7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7XG4gICAgICAgICAgICAgICAgY29uc3QgdGltZW91dElkID0gc2V0VGltZW91dCgoKSA9PiBjb250cm9sbGVyLmFib3J0KCksIHRpbWVvdXRNcyk7XG5cbiAgICAgICAgICAgICAgICBjb25zdCBmZXRjaE9wdGlvbnM6IGFueSA9IHtcbiAgICAgICAgICAgICAgICAgICAgbWV0aG9kOiBtZXRob2QsXG4gICAgICAgICAgICAgICAgICAgIHNpZ25hbDogY29udHJvbGxlci5zaWduYWxcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIGlmIChhZ2VudCkge1xuICAgICAgICAgICAgICAgICAgICBmZXRjaE9wdGlvbnMuZGlzcGF0Y2hlciA9IGFnZW50O1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2godXJsLCBmZXRjaE9wdGlvbnMpO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aW1lb3V0SWQpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGVuZFRpbWUgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAgICAgICAgICAgICAgICBjb25zdCBkdXJhdGlvbiA9IE1hdGgucm91bmQoZW5kVGltZSAtIHN0YXJ0VGltZSk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgdG90YWxTdWNjZXNzVGltZSArPSBkdXJhdGlvbjtcbiAgICAgICAgICAgICAgICBzdWNjZXNzQ291bnQrKztcblxuICAgICAgICAgICAgICAgIGNvbnN0IHN0YXR1c0xpbmUgPSBgJHtyZXNwb25zZS5zdGF0dXN9IHwgJHtkdXJhdGlvbn1tcyB8ICR7dXJsfWA7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYFske3VybEluZGV4ICsgMX0vJHt1cmxzLmxlbmd0aH1dICR7c3RhdHVzTGluZX1gKTtcbiAgICAgICAgICAgICAgICBvdXRwdXRTdHJlYW0ud3JpdGUoc3RhdHVzTGluZSArICdcXG4nKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBlbmRUaW1lID0gcGVyZm9ybWFuY2Uubm93KCk7XG4gICAgICAgICAgICAgICAgY29uc3QgZHVyYXRpb24gPSBNYXRoLnJvdW5kKGVuZFRpbWUgLSBzdGFydFRpbWUpO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGxldCBzdGF0dXMgPSAnRVJST1InO1xuICAgICAgICAgICAgICAgIGlmIChlcnJvci5uYW1lID09PSAnQWJvcnRFcnJvcicpIHtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzID0gJ1RJTUVPVVQnO1xuICAgICAgICAgICAgICAgICAgICB0aW1lb3V0Q291bnQrKztcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBlcnJvckNvdW50Kys7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IHN0YXR1c0xpbmUgPSBgJHtzdGF0dXN9IHwgJHtkdXJhdGlvbn1tcyB8ICR7dXJsfWA7XG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgWyR7dXJsSW5kZXggKyAxfS8ke3VybHMubGVuZ3RofV0gJHtzdGF0dXNMaW5lfSAtICR7ZXJyb3IubWVzc2FnZX1gKTtcbiAgICAgICAgICAgICAgICBvdXRwdXRTdHJlYW0ud3JpdGUoc3RhdHVzTGluZSArICdcXG4nKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH07XG5cbiAgICBjb25zdCB3b3JrZXJDb3VudCA9IE1hdGgubWluKGNvbmN1cnJlbmN5LCB1cmxzLmxlbmd0aCk7XG4gICAgY29uc3Qgd29ya2VycyA9IEFycmF5LmZyb20oeyBsZW5ndGg6IHdvcmtlckNvdW50IH0sICgpID0+IHJ1bldvcmtlcigpKTtcbiAgICBcbiAgICBhd2FpdCBQcm9taXNlLmFsbCh3b3JrZXJzKTtcblxuICAgIGNvbnN0IGVuZFRpbWVPdmVyYWxsID0gcGVyZm9ybWFuY2Uubm93KCk7XG4gICAgY29uc3QgdG90YWxEdXJhdGlvbiA9ICgoZW5kVGltZU92ZXJhbGwgLSBzdGFydFRpbWVPdmVyYWxsKSAvIDEwMDApLnRvRml4ZWQoMik7XG4gICAgY29uc3QgYXZnVGltZSA9IHN1Y2Nlc3NDb3VudCA+IDAgPyAodG90YWxTdWNjZXNzVGltZSAvIHN1Y2Nlc3NDb3VudCkudG9GaXhlZCgyKSA6ICcwJztcblxuICAgIG91dHB1dFN0cmVhbS5lbmQoKTtcblxuICAgIGNvbnNvbGUubG9nKGBcXG4tLS0gUmllcGlsb2dvIEZpbmFsZSAtLS1gKTtcbiAgICBjb25zb2xlLmxvZyhgVGVtcG8gdG90YWxlIGVzZWN1emlvbmU6ICR7dG90YWxEdXJhdGlvbn1zYCk7XG4gICAgY29uc29sZS5sb2coYFVSTCBwcm9jZXNzYXRpOiAke3VybHMubGVuZ3RofWApO1xuICAgIGNvbnNvbGUubG9nKGBTdWNjZXNzaTogJHtzdWNjZXNzQ291bnR9YCk7XG4gICAgY29uc29sZS5sb2coYEVycm9yaTogJHtlcnJvckNvdW50fWApO1xuICAgIGNvbnNvbGUubG9nKGBUaW1lb3V0OiAke3RpbWVvdXRDb3VudH1gKTtcbiAgICBpZiAoc3VjY2Vzc0NvdW50ID4gMCkge1xuICAgICAgICBjb25zb2xlLmxvZyhgVGVtcG8gZGkgcmlzcG9zdGEgbWVkaW8gKHN1Y2Nlc3NpKTogJHthdmdUaW1lfW1zYCk7XG4gICAgfVxuICAgIGNvbnNvbGUubG9nKGAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1gKTtcbiAgICBjb25zb2xlLmxvZyhgXFxuQ29tcGxldGF0by4gUmlzdWx0YXRpIHNhbHZhdGkgaW4gJHtvdXRwdXRQYXRofWApO1xufVxuXG5tYWluKClcbiAgICAuY2F0Y2goZXJyID0+IHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvcmUgZmF0YWxlOicsIGVycik7XG4gICAgcHJvY2Vzcy5leGl0KDEpO1xufSk7XG4iXX0=