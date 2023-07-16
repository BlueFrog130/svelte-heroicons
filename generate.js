import { Octokit } from 'octokit';
import { config } from 'dotenv';
import { resolve, join } from 'node:path';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
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

await get('optimized');

for (const [key, files] of Object.entries(directories)) {
	const dest = join(destFolder, key, 'index.ts');
	const contents = files
		.map((f) => `export { default as ${f.slice(0, -7)} } from './${f}'`)
		.join('\n');

	await writeFile(dest, contents);
}

execSync('npm run format');

execSync('npm run build');

// Read ./package.json
const packageJson = JSON.parse(await readFile('./package.json', 'utf-8'));

packageJson.svelte = './index.js';

// Export all files in ./package folder
packageJson.exports = {
	'./package.json': './package.json',
	'.': {
		types: './index.d.ts',
		svelte: './index.js',
		default: './index.js'
	}
};

packageJson.typesVersions = {
	'>4.0': {}
};

for (const [key, files] of Object.entries(directories)) {
	packageJson.exports[`./${key}`] = {
		types: `./${key}/index.d.ts`,
		svelte: `./${key}/index.js`,
		default: `./${key}/index.js`
	};

	packageJson.typesVersions['>4.0'][`./${key}`] = [`./${key}/index.d.ts`];

	for (const file of files) {
		packageJson.exports[`./${key}/${file}`] = {
			types: `./${key}/${file}.d.ts`,
			svelte: `./${key}/${file}`,
			default: `./${key}/${file}`
		};

		packageJson.typesVersions['>4.0'][`./${key}/${file}`] = [`./${key}/${file}.d.ts`];
	}
}

// Remove prepublishOnly script
delete packageJson.scripts.prepublishOnly;

// Write ./package.json
await writeFile('./package/package.json', JSON.stringify(packageJson, null, 2));

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
