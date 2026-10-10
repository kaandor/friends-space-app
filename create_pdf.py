import weasyprint

html_content = open('pitch-deck.html', 'r', encoding='utf-8').read()
doc = weasyprint.HTML(string=html_content).write_pdf()
with open('Friends-Space-Pitch-Decks.pdf', 'wb') as f:
    f.write(doc)
print('PDF gerado com sucesso: Friends-Space-Pitch-Decks.pdf')