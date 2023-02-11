import { Octokit } from 'octokit';
import { config } from 'dotenv';
import { resolve, join } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';

config();

const octokit = new Octokit({
	auth: process.env.GITHUB_TOKEN
});

const map = {
	'20/solid': 'mini',
	'24/solid': 'solid',
	'24/outline': 'outline'
};

/** @type {{ [dir: string]: string[] }} */
const directories = {};

const destFolder = resolve('./src/lib');

/**
 * @param {string} path
 */
async function get(path) {
	const trimmed = path.slice(10);

	if (trimmed && map[trimmed]) directories[map[trimmed]] = [];

	const response = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
		owner: 'tailwindlabs',
		repo: 'heroicons',
		path
	});

	if (response.data instanceof Array) {
		await Promise.all(
			response.data.map(async (entry) => {
				switch (entry.type) {
					case 'dir':
						await get(entry.path);
						break;
					case 'file':
						const svelteFile = entry.name
							.replace(/(^\w|-\w)/g, (t) => t.replace(/-/, '').toUpperCase())
							.replace('.svg', '.svelte');
						directories[map[trimmed]].push(svelteFile);
						const response = await fetch(entry.download_url);
						const text = await response.text();

						const dest = join(destFolder, map[trimmed], svelteFile);

						const file = `
<svelte:options namespace="svg" />

${formatSvg(text)}
`;

						await mkdir(join(destFolder, map[trimmed]), { recursive: true });

						await writeFile(dest, file);

						break;
				}
			})
		);
	}
}

/**
 * @param {string} svg
 */
function formatSvg(svg) {
	return svg.replace(/ (width|height)="\d{2}"/g, '');
}

await get('optimized');

for (const [key, files] of Object.entries(directories)) {
	const dest = join(destFolder, key, 'index.ts');
	const contents = files
		.map((f) => `export { default as ${f.slice(0, -7)} } from './${f}'`)
		.join('\n');

	await writeFile(dest, contents);
}

execSync('npm run format');
