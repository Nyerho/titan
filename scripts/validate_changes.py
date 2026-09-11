from pathlib import Path
from html.parser import HTMLParser

root = Path(__file__).resolve().parents[1]
required = {
    'index.html': ['Knowledge Hub', 'Publications and Insights', 'Deals and Announcements', 'Resource Center', 'knowledge-hub.css'],
    'kyc-portal.html': ['submitVerificationBtn', 'idFrontFileInput', 'idBackFileInput', 'js/kyc-portal.js'],
    'js/admin-kyc.js': ['data.files?.idFrontUrl', 'data.files?.idBackUrl'],
    'firestore.rules': ["request.resource.data.status == 'pending'", 'kycLastReviewedAt'],
}
for name, needles in required.items():
    text = (root / name).read_text()
    missing = [needle for needle in needles if needle not in text]
    if missing:
        raise SystemExit(f'{name}: missing {missing}')

class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.hrefs = []
    def handle_starttag(self, tag, attrs):
        if tag in {'a', 'link', 'script'}:
            attrs = dict(attrs)
            value = attrs.get('href') or attrs.get('src')
            if value and not value.startswith(('http:', 'https:', '#', 'mailto:')):
                self.hrefs.append(value.split('#', 1)[0])

for page in ['index.html', 'publications.html', 'deals-and-announcements.html', 'resource-center.html']:
    parser = LinkParser()
    parser.feed((root / page).read_text())
    for href in parser.hrefs:
        if Path(href).suffix.lower() not in {'.html', '.css', '.js'}:
            continue
        if href in {'publications.html', 'deals-and-announcements.html', 'resource-center.html', 'css/knowledge-hub.css'}:
            target = root / href
            if not target.exists():
                raise SystemExit(f'{page}: missing new local target {href}')

print('validation passed')
