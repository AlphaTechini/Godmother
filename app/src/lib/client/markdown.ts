// A deliberately small, safe markdown renderer for assistant messages.
// Input is HTML-escaped first; only a known set of constructs is turned back into markup.
// Supports paragraphs, line breaks, **bold**, *italic*, `code`, [links](https://…), - / 1. lists
// and ### headings. Partial syntax while streaming degrades to plain text.

const esc = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(s: string): string {
	let out = esc(s);
	out = out.replace(/`([^`\n]+)`/g, '<code>$1</code>');
	out = out.replace(
		/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
		'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
	);
	out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
	out = out.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>');
	out = out.replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>');
	return out;
}

export function renderMarkdown(src: string): string {
	const lines = src.replace(/\r\n/g, '\n').split('\n');
	const html: string[] = [];
	let para: string[] = [];
	let list: { ordered: boolean; items: string[] } | null = null;

	const flushPara = () => {
		if (para.length) html.push(`<p>${para.map(inline).join('<br>')}</p>`);
		para = [];
	};
	const flushList = () => {
		if (list) {
			const tag = list.ordered ? 'ol' : 'ul';
			html.push(`<${tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${tag}>`);
		}
		list = null;
	};

	for (const raw of lines) {
		const line = raw.trimEnd();
		const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
		const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
		const heading = /^#{1,4}\s+(.*)$/.exec(line);
		if (!line.trim()) {
			flushPara();
			flushList();
		} else if (heading) {
			flushPara();
			flushList();
			html.push(`<h4>${inline(heading[1])}</h4>`);
		} else if (bullet || numbered) {
			flushPara();
			const ordered = !!numbered;
			if (list && list.ordered !== ordered) flushList();
			list ??= { ordered, items: [] };
			list.items.push((bullet ?? numbered)![1]);
		} else {
			flushList();
			para.push(line);
		}
	}
	flushPara();
	flushList();
	return html.join('');
}
