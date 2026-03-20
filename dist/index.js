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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFDQSx1Q0FBeUI7QUFDekIsMkNBQTZCO0FBQzdCLCtDQUFpQztBQUNqQyxtQ0FBb0Q7QUFFcEQ7Ozs7O0dBS0c7QUFFSCxLQUFLLFVBQVUsZ0JBQWdCLENBQUMsVUFBa0IsRUFBRSxTQUFpQixFQUFFLFdBQW9CLEtBQUs7SUFDNUYsSUFBSSxDQUFDO1FBQ0QsTUFBTSxVQUFVLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQUN6QyxNQUFNLFNBQVMsR0FBRyxVQUFVLENBQUMsR0FBRyxFQUFFLENBQUMsVUFBVSxDQUFDLEtBQUssRUFBRSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBRWxFLE1BQU0sWUFBWSxHQUFRLEVBQUUsTUFBTSxFQUFFLFVBQVUsQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUN4RCxJQUFJLFFBQVEsRUFBRSxDQUFDO1lBQ1gsWUFBWSxDQUFDLFVBQVUsR0FBRyxJQUFJLGNBQUssQ0FBQztnQkFDaEMsT0FBTyxFQUFFO29CQUNMLGtCQUFrQixFQUFFLEtBQUs7aUJBQzVCO2FBQ0osQ0FBQyxDQUFDO1FBQ1AsQ0FBQztRQUVELE1BQU0sUUFBUSxHQUFHLE1BQU0sS0FBSyxDQUFDLFVBQVUsRUFBRSxZQUFZLENBQUMsQ0FBQztRQUN2RCxZQUFZLENBQUMsU0FBUyxDQUFDLENBQUM7UUFFeEIsSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNmLE1BQU0sSUFBSSxLQUFLLENBQUMsdUJBQXVCLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBQzlELENBQUM7UUFFRCxNQUFNLEdBQUcsR0FBRyxNQUFNLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNsQyxNQUFNLE1BQU0sR0FBRyxNQUFNLE1BQU0sQ0FBQyxrQkFBa0IsQ0FB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Q0FBdUMsT0FBTyxJQUFJLENBQUMsQ0FBQztJQUNwRSxDQUFDO0lBQ0QsT0FBTyxDQUFDLEdBQUcsQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO0lBQ3hDLE9BQU8sQ0FBQyxHQUFHLENBQUMsc0NBQXNDLFVBQVUsRUFBRSxDQUFDLENBQUM7QUFDcEUsQ0FBQztBQUVELElBQUksRUFBRTtLQUNELEtBQUssQ0FBQyxHQUFHLENBQUMsRUFBRTtJQUNiLE9BQU8sQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDckMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNwQixDQUFDLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5vZGVcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgKiBhcyB4bWwyanMgZnJvbSAneG1sMmpzJztcbmltcG9ydCB7IEFnZW50LCBzZXRHbG9iYWxEaXNwYXRjaGVyIH0gZnJvbSAndW5kaWNpJztcblxuLyoqXG4gKiBTY3JpcHQgTm9kZS5qcyBpbiBUeXBlU2NyaXB0IHBlciByaWNoaWFtYXJlIHBhZ2luZSB3ZWIgZGEgdW5hIGxpc3RhIG8gZGEgdW5hIHNpdGVtYXAgWE1MLlxuICogXG4gKiBVdGlsaXp6bzpcbiAqIG5weCBnaXRodWI6YW5kcmVhLW5pZ3JvL3dhcm1lciBbLS1saXN0IDxmaWxlX3VybD5dIFstLXNpdGVtYXB4bWwgPHNpdGVtYXBfdXJsPl0gWy0tc2l0ZW1hcHhtbC1yZWN1cnNpdmUgPHNpdGVtYXBfdXJsMSxzaXRlbWFwX3VybDIsLi4uPl0gWy0tY29uY3VycmVuY3kgPG4+XSBbLS10aW1lb3V0IDxtcz5dIFstLW1ldGhvZCA8R0VUfFBPU1R8Li4uPl0gWy0taW5zZWN1cmVdXG4gKi9cblxuYXN5bmMgZnVuY3Rpb24gZmV0Y2hTaXRlbWFwVXJscyhzaXRlbWFwVXJsOiBzdHJpbmcsIHRpbWVvdXRNczogbnVtYmVyLCBpbnNlY3VyZTogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7XG4gICAgICAgIGNvbnN0IHRpbWVvdXRJZCA9IHNldFRpbWVvdXQoKCkgPT4gY29udHJvbGxlci5hYm9ydCgpLCB0aW1lb3V0TXMpO1xuXG4gICAgICAgIGNvbnN0IGZldGNoT3B0aW9uczogYW55ID0geyBzaWduYWw6IGNvbnRyb2xsZXIuc2lnbmFsIH07XG4gICAgICAgIGlmIChpbnNlY3VyZSkge1xuICAgICAgICAgICAgZmV0Y2hPcHRpb25zLmRpc3BhdGNoZXIgPSBuZXcgQWdlbnQoe1xuICAgICAgICAgICAgICAgIGNvbm5lY3Q6IHtcbiAgICAgICAgICAgICAgICAgICAgcmVqZWN0VW5hdXRob3JpemVkOiBmYWxzZVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChzaXRlbWFwVXJsLCBmZXRjaE9wdGlvbnMpO1xuICAgICAgICBjbGVhclRpbWVvdXQodGltZW91dElkKTtcblxuICAgICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEhUVFAgZXJyb3IhIHN0YXR1czogJHtyZXNwb25zZS5zdGF0dXN9YCk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCB4bWwgPSBhd2FpdCByZXNwb25zZS50ZXh0KCk7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHhtbDJqcy5wYXJzZVN0cmluZ1Byb21pc2UoeG1sKTtcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IHVybHM6IHN0cmluZ1tdID0gW107XG4gICAgICAgIFxuICAgICAgICBpZiAocmVzdWx0LnVybHNldCAmJiByZXN1bHQudXJsc2V0LnVybCkge1xuICAgICAgICAgICAgZm9yIChjb25zdCBlbnRyeSBvZiByZXN1bHQudXJsc2V0LnVybCkge1xuICAgICAgICAgICAgICAgIGlmIChlbnRyeS5sb2MgJiYgZW50cnkubG9jWzBdKSB7XG4gICAgICAgICAgICAgICAgICAgIHVybHMucHVzaChlbnRyeS5sb2NbMF0udHJpbSgpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAocmVzdWx0LnNpdGVtYXBpbmRleCAmJiByZXN1bHQuc2l0ZW1hcGluZGV4LnNpdGVtYXApIHtcbiAgICAgICAgICAgIC8vIFNlIMOoIHVuIGluZGljZSBkaSBzaXRlbWFwLCBwb3RyZW1tbyB2b2xlcmxlIHByb2Nlc3NhcmUgcmljb3JzaXZhbWVudGUsIFxuICAgICAgICAgICAgLy8gbWEgcGVyIG9yYSBsaW1pdGlhbW9jaSBhIGVzdHJhcnJlIHF1ZWxsZSBwcmVzZW50aS5cbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdSaWxldmF0byBpbmRpY2UgZGkgc2l0ZW1hcC4gRXN0cmF6aW9uZSBzaXRlbWFwIGZpZ2xpZS4uLicpO1xuICAgICAgICAgICAgZm9yIChjb25zdCBlbnRyeSBvZiByZXN1bHQuc2l0ZW1hcGluZGV4LnNpdGVtYXApIHtcbiAgICAgICAgICAgICAgICBpZiAoZW50cnkubG9jICYmIGVudHJ5LmxvY1swXSkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBzdWJVcmxzID0gYXdhaXQgZmV0Y2hTaXRlbWFwVXJscyhlbnRyeS5sb2NbMF0udHJpbSgpLCB0aW1lb3V0TXMsIGluc2VjdXJlKTtcbiAgICAgICAgICAgICAgICAgICAgdXJscy5wdXNoKC4uLnN1YlVybHMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgcmV0dXJuIHVybHM7XG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKGBFcnJvcmUgZHVyYW50ZSBpbCByZWN1cGVybyBkZWxsYSBzaXRlbWFwICgke3NpdGVtYXBVcmx9KTogJHtlcnJvci5tZXNzYWdlfWApO1xuICAgICAgICByZXR1cm4gW107XG4gICAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBtYWluKCkge1xuICAgIGNvbnN0IGFyZ3MgPSBwcm9jZXNzLmFyZ3Yuc2xpY2UoMik7XG5cbiAgICBjb25zdCBnZXRBcmdWYWx1ZSA9IChmbGFnOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQgPT4ge1xuICAgICAgICBjb25zdCBpbmRleCA9IGFyZ3MuaW5kZXhPZihmbGFnKTtcbiAgICAgICAgaWYgKGluZGV4ICE9PSAtMSAmJiBpbmRleCArIDEgPCBhcmdzLmxlbmd0aCkge1xuICAgICAgICAgICAgcmV0dXJuIGFyZ3NbaW5kZXggKyAxXTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH07XG5cbiAgICBjb25zdCBnZXRBcmdWYWx1ZXMgPSAoZmxhZzogc3RyaW5nKTogc3RyaW5nW10gPT4ge1xuICAgICAgICBjb25zdCB2YWx1ZXM6IHN0cmluZ1tdID0gW107XG4gICAgICAgIGxldCBpbmRleCA9IGFyZ3MuaW5kZXhPZihmbGFnKTtcbiAgICAgICAgd2hpbGUgKGluZGV4ICE9PSAtMSkge1xuICAgICAgICAgICAgaWYgKGluZGV4ICsgMSA8IGFyZ3MubGVuZ3RoICYmICFhcmdzW2luZGV4ICsgMV0uc3RhcnRzV2l0aCgnLS0nKSkge1xuICAgICAgICAgICAgICAgIC8vIFN1cHBvcnRhIHNpYSAtLWZsYWcgdmFsMSAtLWZsYWcgdmFsMiBjaGUgLS1mbGFnIHZhbDEgdmFsMiB2YWwzIChmaW5vIGFsIHByb3NzaW1vIGZsYWcpXG4gICAgICAgICAgICAgICAgbGV0IG5leHRJbmRleCA9IGluZGV4ICsgMTtcbiAgICAgICAgICAgICAgICB3aGlsZSAobmV4dEluZGV4IDwgYXJncy5sZW5ndGggJiYgIWFyZ3NbbmV4dEluZGV4XS5zdGFydHNXaXRoKCctLScpKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKGFyZ3NbbmV4dEluZGV4XSk7XG4gICAgICAgICAgICAgICAgICAgIG5leHRJbmRleCsrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGluZGV4ID0gYXJncy5pbmRleE9mKGZsYWcsIGluZGV4ICsgMSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHZhbHVlcztcbiAgICB9O1xuXG4gICAgY29uc3QgZmlsZVBhdGggPSBnZXRBcmdWYWx1ZSgnLS1saXN0Jyk7XG4gICAgY29uc3Qgc2l0ZW1hcFVybCA9IGdldEFyZ1ZhbHVlKCctLXNpdGVtYXB4bWwnKTtcbiAgICBjb25zdCBzaXRlbWFwUmVjdXJzaXZlVXJscyA9IGdldEFyZ1ZhbHVlcygnLS1zaXRlbWFweG1sLXJlY3Vyc2l2ZScpO1xuICAgIGNvbnN0IGNvbmN1cnJlbmN5U3RyID0gZ2V0QXJnVmFsdWUoJy0tY29uY3VycmVuY3knKTtcbiAgICBjb25zdCB0aW1lb3V0U3RyID0gZ2V0QXJnVmFsdWUoJy0tdGltZW91dCcpO1xuICAgIGNvbnN0IG1ldGhvZFN0ciA9IGdldEFyZ1ZhbHVlKCctLW1ldGhvZCcpO1xuICAgIGNvbnN0IGluc2VjdXJlID0gYXJncy5pbmNsdWRlcygnLS1pbnNlY3VyZScpO1xuXG4gICAgaWYgKGFyZ3MuaW5jbHVkZXMoJy0taGVscCcpIHx8IGFyZ3MuaW5jbHVkZXMoJy1oJykgfHwgKCFmaWxlUGF0aCAmJiAhc2l0ZW1hcFVybCAmJiBzaXRlbWFwUmVjdXJzaXZlVXJscy5sZW5ndGggPT09IDApKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKCdVdGlsaXp6bzogbnB4IGdpdGh1YjphbmRyZWEtbmlncm8vd2FybWVyIFstLWxpc3QgPGZpbGVfdXJsPl0gWy0tc2l0ZW1hcHhtbCA8c2l0ZW1hcF91cmw+XSBbLS1zaXRlbWFweG1sLXJlY3Vyc2l2ZSA8c2l0ZW1hcF91cmwxPiA8c2l0ZW1hcF91cmwyPiAuLi5dIFstLWNvbmN1cnJlbmN5IDxuPl0gWy0tdGltZW91dCA8bXM+XSBbLS1tZXRob2QgPEdFVHxQT1NUfC4uLj5dIFstLWluc2VjdXJlXScpO1xuICAgICAgICBjb25zb2xlLmxvZygnXFxuUGFyYW1ldHJpOicpO1xuICAgICAgICBjb25zb2xlLmxvZygnICAtLWxpc3QgPGZpbGU+ICAgICAgICAgICAgICAgRmlsZSBkaSB0ZXN0byBjb24gbGlzdGEgZGkgVVJMICh1bm8gcGVyIHJpZ2EpJyk7XG4gICAgICAgIGNvbnNvbGUubG9nKCcgIC0tc2l0ZW1hcHhtbCA8dXJsPiAgICAgICAgICBVUkwgZGkgdW5hIHNpdGVtYXAgWE1MJyk7XG4gICAgICAgIGNvbnNvbGUubG9nKCcgIC0tc2l0ZW1hcHhtbC1yZWN1cnNpdmUgPHVybHM+IFVubyBvIHBpw7kgVVJMIGRpIHNpdGVtYXAgKGFuY2hlIGluZGljaSkgc2VwYXJhdGkgZGEgc3BhemlvJyk7XG4gICAgICAgIGNvbnNvbGUubG9nKCcgIC0tY29uY3VycmVuY3kgPG4+ICAgICAgICAgICBOdW1lcm8gZGkgcmljaGllc3RlIHNpbXVsdGFuZWUgKGRlZmF1bHQ6IDUpJyk7XG4gICAgICAgIGNvbnNvbGUubG9nKCcgIC0tdGltZW91dCA8bXM+ICAgICAgICAgICAgICBUaW1lb3V0IHBlciBzaW5nb2xhIHJpY2hpZXN0YSBpbiBtcyAoZGVmYXVsdDogMTAwMDApJyk7XG4gICAgICAgIGNvbnNvbGUubG9nKCcgIC0tbWV0aG9kIDxHRVR8SEVBRHwuLi4+ICAgICBNZXRvZG8gSFRUUCBkYSB1c2FyZSAoZGVmYXVsdDogR0VUKScpO1xuICAgICAgICBjb25zb2xlLmxvZygnICAtLWluc2VjdXJlICAgICAgICAgICAgICAgICAgRGlzYWJpbGl0YSBpbCBjb250cm9sbG8gZGVpIGNlcnRpZmljYXRpIFNTTCcpO1xuICAgICAgICBjb25zb2xlLmxvZygnXFxuRXNlbXBpOicpO1xuICAgICAgICBjb25zb2xlLmxvZygnICBucHggZ2l0aHViOmFuZHJlYS1uaWdyby93YXJtZXIgLS1saXN0IHVybHMudHh0IC0tY29uY3VycmVuY3kgNScpO1xuICAgICAgICBjb25zb2xlLmxvZygnICBucHggZ2l0aHViOmFuZHJlYS1uaWdyby93YXJtZXIgLS1zaXRlbWFweG1sIGh0dHBzOi8vZXhhbXBsZS5jb20vc2l0ZW1hcC54bWwnKTtcbiAgICAgICAgY29uc29sZS5sb2coJyAgbnB4IGdpdGh1YjphbmRyZWEtbmlncm8vd2FybWVyIC0tc2l0ZW1hcHhtbC1yZWN1cnNpdmUgaHR0cHM6Ly9leGFtcGxlLmNvbS9zMS54bWwgaHR0cHM6Ly9leGFtcGxlLmNvbS9zMi54bWwnKTtcbiAgICAgICAgcHJvY2Vzcy5leGl0KDApO1xuICAgIH1cblxuICAgIGNvbnN0IGNvbmN1cnJlbmN5ID0gcGFyc2VJbnQoY29uY3VycmVuY3lTdHIgfHwgJzUnLCAxMCk7XG4gICAgY29uc3QgdGltZW91dE1zID0gcGFyc2VJbnQodGltZW91dFN0ciB8fCAnMTAwMDAnLCAxMCk7XG4gICAgY29uc3QgbWV0aG9kID0gKG1ldGhvZFN0ciB8fCAnR0VUJykudG9VcHBlckNhc2UoKTtcblxuICAgIGxldCB1cmxzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgaWYgKGZpbGVQYXRoKSB7XG4gICAgICAgIGlmICghZnMuZXhpc3RzU3luYyhmaWxlUGF0aCkpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEVycm9yZTogSWwgZmlsZSBcIiR7ZmlsZVBhdGh9XCIgbm9uIGVzaXN0ZS5gKTtcbiAgICAgICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBmaWxlVXJscyA9IGZzLnJlYWRGaWxlU3luYyhmaWxlUGF0aCwgJ3V0Zi04JylcbiAgICAgICAgICAgIC5zcGxpdCgnXFxuJylcbiAgICAgICAgICAgIC5tYXAobGluZSA9PiBsaW5lLnRyaW0oKSlcbiAgICAgICAgICAgIC5maWx0ZXIobGluZSA9PiBsaW5lLmxlbmd0aCA+IDAgJiYgIWxpbmUuc3RhcnRzV2l0aCgnIycpKTtcbiAgICAgICAgdXJscy5wdXNoKC4uLmZpbGVVcmxzKTtcbiAgICB9XG5cbiAgICBpZiAoc2l0ZW1hcFVybCkge1xuICAgICAgICBjb25zb2xlLmxvZyhgUmVjdXBlcm8gVVJMIGRhbGxhIHNpdGVtYXA6ICR7c2l0ZW1hcFVybH0uLi5gKTtcbiAgICAgICAgY29uc3Qgc2l0ZW1hcFVybHMgPSBhd2FpdCBmZXRjaFNpdGVtYXBVcmxzKHNpdGVtYXBVcmwsIHRpbWVvdXRNcywgaW5zZWN1cmUpO1xuICAgICAgICB1cmxzLnB1c2goLi4uc2l0ZW1hcFVybHMpO1xuICAgIH1cblxuICAgIGZvciAoY29uc3Qgc1VybCBvZiBzaXRlbWFwUmVjdXJzaXZlVXJscykge1xuICAgICAgICBjb25zb2xlLmxvZyhgUmVjdXBlcm8gcmljb3JzaXZvIFVSTCBkYWxsYSBzaXRlbWFwOiAke3NVcmx9Li4uYCk7XG4gICAgICAgIGNvbnN0IHNpdGVtYXBVcmxzID0gYXdhaXQgZmV0Y2hTaXRlbWFwVXJscyhzVXJsLCB0aW1lb3V0TXMsIGluc2VjdXJlKTtcbiAgICAgICAgdXJscy5wdXNoKC4uLnNpdGVtYXBVcmxzKTtcbiAgICB9XG5cbiAgICAvLyBSaW11b3ZpIGR1cGxpY2F0aSBzZSBwcmVzZW50aVxuICAgIHVybHMgPSBbLi4ubmV3IFNldCh1cmxzKV07XG5cbiAgICBpZiAodXJscy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgY29uc29sZS5sb2coJ05lc3N1biBVUkwgdHJvdmF0byBkYSBwcm9jZXNzYXJlLicpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3Qgb3V0cHV0RmlsZU5hbWUgPSBgd2FybWVyX3Jlc3VsdHNfJHtuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkucmVwbGFjZSgvWzouXS9nLCAnLScpfS5sb2dgO1xuICAgIGNvbnN0IG91dHB1dERpciA9IHBhdGgucmVzb2x2ZShwcm9jZXNzLmN3ZCgpLCAnd2FybWVyJyk7XG4gICAgaWYgKCFmcy5leGlzdHNTeW5jKG91dHB1dERpcikpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGZzLm1rZGlyU3luYyhvdXRwdXREaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgICAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRXJyb3JlOiBJbXBvc3NpYmlsZSBjcmVhcmUgbGEgY2FydGVsbGEgZGkgb3V0cHV0IFwiJHtvdXRwdXREaXJ9XCI6ICR7ZXJyLm1lc3NhZ2V9YCk7XG4gICAgICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgY29uc3Qgb3V0cHV0UGF0aCA9IHBhdGgucmVzb2x2ZShvdXRwdXREaXIsIG91dHB1dEZpbGVOYW1lKTtcbiAgICBjb25zdCBvdXRwdXRTdHJlYW0gPSBmcy5jcmVhdGVXcml0ZVN0cmVhbShvdXRwdXRQYXRoKTtcblxuICAgIGNvbnNvbGUubG9nKGBJbml6aW8gd2FybWluZyBkaSAke3VybHMubGVuZ3RofSBVUkwuLi5gKTtcbiAgICBjb25zb2xlLmxvZyhgQ29uZmlndXJhemlvbmU6IENvbmNvcnJlbnphPSR7Y29uY3VycmVuY3l9LCBUaW1lb3V0PSR7dGltZW91dE1zfW1zLCBNZXRvZG89JHttZXRob2R9LCBJbnNlY3VyZT0ke2luc2VjdXJlfWApO1xuICAgIGNvbnNvbGUubG9nKGBPdXRwdXQgaW46ICR7b3V0cHV0UGF0aH1cXG5gKTtcblxuICAgIGxldCBjdXJyZW50SW5kZXggPSAwO1xuICAgIGxldCB0b3RhbFN1Y2Nlc3NUaW1lID0gMDtcbiAgICBsZXQgc3VjY2Vzc0NvdW50ID0gMDtcbiAgICBsZXQgZXJyb3JDb3VudCA9IDA7XG4gICAgbGV0IHRpbWVvdXRDb3VudCA9IDA7XG4gICAgY29uc3Qgc3RhcnRUaW1lT3ZlcmFsbCA9IHBlcmZvcm1hbmNlLm5vdygpO1xuXG4gICAgY29uc3QgcnVuV29ya2VyID0gYXN5bmMgKCkgPT4ge1xuICAgICAgICBjb25zdCBhZ2VudCA9IGluc2VjdXJlID8gbmV3IEFnZW50KHtcbiAgICAgICAgICAgIGNvbm5lY3Q6IHtcbiAgICAgICAgICAgICAgICByZWplY3RVbmF1dGhvcml6ZWQ6IGZhbHNlXG4gICAgICAgICAgICB9XG4gICAgICAgIH0pIDogdW5kZWZpbmVkO1xuXG4gICAgICAgIHdoaWxlIChjdXJyZW50SW5kZXggPCB1cmxzLmxlbmd0aCkge1xuICAgICAgICAgICAgY29uc3QgdXJsSW5kZXggPSBjdXJyZW50SW5kZXgrKztcbiAgICAgICAgICAgIGNvbnN0IHVybCA9IHVybHNbdXJsSW5kZXhdO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBjb25zdCBzdGFydFRpbWUgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgY29udHJvbGxlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcbiAgICAgICAgICAgICAgICBjb25zdCB0aW1lb3V0SWQgPSBzZXRUaW1lb3V0KCgpID0+IGNvbnRyb2xsZXIuYWJvcnQoKSwgdGltZW91dE1zKTtcblxuICAgICAgICAgICAgICAgIGNvbnN0IGZldGNoT3B0aW9uczogYW55ID0ge1xuICAgICAgICAgICAgICAgICAgICBtZXRob2Q6IG1ldGhvZCxcbiAgICAgICAgICAgICAgICAgICAgc2lnbmFsOiBjb250cm9sbGVyLnNpZ25hbFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgaWYgKGFnZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIGZldGNoT3B0aW9ucy5kaXNwYXRjaGVyID0gYWdlbnQ7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCh1cmwsIGZldGNoT3B0aW9ucyk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXRJZCk7XG4gICAgICAgICAgICAgICAgY29uc3QgZW5kVGltZSA9IHBlcmZvcm1hbmNlLm5vdygpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGR1cmF0aW9uID0gTWF0aC5yb3VuZChlbmRUaW1lIC0gc3RhcnRUaW1lKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICB0b3RhbFN1Y2Nlc3NUaW1lICs9IGR1cmF0aW9uO1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3NDb3VudCsrO1xuXG4gICAgICAgICAgICAgICAgY29uc3Qgc3RhdHVzTGluZSA9IGAke3Jlc3BvbnNlLnN0YXR1c30gfCAke2R1cmF0aW9ufW1zIHwgJHt1cmx9YDtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgWyR7dXJsSW5kZXggKyAxfS8ke3VybHMubGVuZ3RofV0gJHtzdGF0dXNMaW5lfWApO1xuICAgICAgICAgICAgICAgIG91dHB1dFN0cmVhbS53cml0ZShzdGF0dXNMaW5lICsgJ1xcbicpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGVuZFRpbWUgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAgICAgICAgICAgICAgICBjb25zdCBkdXJhdGlvbiA9IE1hdGgucm91bmQoZW5kVGltZSAtIHN0YXJ0VGltZSk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgbGV0IHN0YXR1cyA9ICdFUlJPUic7XG4gICAgICAgICAgICAgICAgaWYgKGVycm9yLm5hbWUgPT09ICdBYm9ydEVycm9yJykge1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMgPSAnVElNRU9VVCc7XG4gICAgICAgICAgICAgICAgICAgIHRpbWVvdXRDb3VudCsrO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGVycm9yQ291bnQrKztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3Qgc3RhdHVzTGluZSA9IGAke3N0YXR1c30gfCAke2R1cmF0aW9ufW1zIHwgJHt1cmx9YDtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBbJHt1cmxJbmRleCArIDF9LyR7dXJscy5sZW5ndGh9XSAke3N0YXR1c0xpbmV9IC0gJHtlcnJvci5tZXNzYWdlfWApO1xuICAgICAgICAgICAgICAgIG91dHB1dFN0cmVhbS53cml0ZShzdGF0dXNMaW5lICsgJ1xcbicpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfTtcblxuICAgIGNvbnN0IHdvcmtlckNvdW50ID0gTWF0aC5taW4oY29uY3VycmVuY3ksIHVybHMubGVuZ3RoKTtcbiAgICBjb25zdCB3b3JrZXJzID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogd29ya2VyQ291bnQgfSwgKCkgPT4gcnVuV29ya2VyKCkpO1xuICAgIFxuICAgIGF3YWl0IFByb21pc2UuYWxsKHdvcmtlcnMpO1xuXG4gICAgY29uc3QgZW5kVGltZU92ZXJhbGwgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAgICBjb25zdCB0b3RhbER1cmF0aW9uID0gKChlbmRUaW1lT3ZlcmFsbCAtIHN0YXJ0VGltZU92ZXJhbGwpIC8gMTAwMCkudG9GaXhlZCgyKTtcbiAgICBjb25zdCBhdmdUaW1lID0gc3VjY2Vzc0NvdW50ID4gMCA/ICh0b3RhbFN1Y2Nlc3NUaW1lIC8gc3VjY2Vzc0NvdW50KS50b0ZpeGVkKDIpIDogJzAnO1xuXG4gICAgb3V0cHV0U3RyZWFtLmVuZCgpO1xuXG4gICAgY29uc29sZS5sb2coYFxcbi0tLSBSaWVwaWxvZ28gRmluYWxlIC0tLWApO1xuICAgIGNvbnNvbGUubG9nKGBUZW1wbyB0b3RhbGUgZXNlY3V6aW9uZTogJHt0b3RhbER1cmF0aW9ufXNgKTtcbiAgICBjb25zb2xlLmxvZyhgVVJMIHByb2Nlc3NhdGk6ICR7dXJscy5sZW5ndGh9YCk7XG4gICAgY29uc29sZS5sb2coYFN1Y2Nlc3NpOiAke3N1Y2Nlc3NDb3VudH1gKTtcbiAgICBjb25zb2xlLmxvZyhgRXJyb3JpOiAke2Vycm9yQ291bnR9YCk7XG4gICAgY29uc29sZS5sb2coYFRpbWVvdXQ6ICR7dGltZW91dENvdW50fWApO1xuICAgIGlmIChzdWNjZXNzQ291bnQgPiAwKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGBUZW1wbyBkaSByaXNwb3N0YSBtZWRpbyAoc3VjY2Vzc2kpOiAke2F2Z1RpbWV9bXNgKTtcbiAgICB9XG4gICAgY29uc29sZS5sb2coYC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLWApO1xuICAgIGNvbnNvbGUubG9nKGBcXG5Db21wbGV0YXRvLiBSaXN1bHRhdGkgc2FsdmF0aSBpbiAke291dHB1dFBhdGh9YCk7XG59XG5cbm1haW4oKVxuICAgIC5jYXRjaChlcnIgPT4ge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yZSBmYXRhbGU6JywgZXJyKTtcbiAgICBwcm9jZXNzLmV4aXQoMSk7XG59KTtcbiJdfQ==