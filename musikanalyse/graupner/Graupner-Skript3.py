# python-Skript 3 zum auswerten der Graupner-Liste

import pandas as pd

# 1. Daten laden (Semikolon als Trenner beachten)
df = pd.read_csv('graupner_saetze_strukturiert.csv', sep=';')

# 2. Jahr extrahieren (alles nach dem '/')
# Wir splitten 'Werk' und nehmen das zweite Element
df['Jahr'] = df['Werk'].str.split('/').str[1].astype(int)

# Da zweistellige Jahre wie '12' für 1712 stehen:
df['Jahr'] = df['Jahr'].apply(lambda x: x + 1700 if x < 100 else x)

# 3. Untersuchung: Wie oft taucht das Wort 'chal' (Chalumeau) in der Besetzung auf?
def hat_instrument(besetzung, instr_kuerzel):
    if pd.isna(besetzung): return False
    return instr_kuerzel in str(besetzung).lower()

df['hat_chalumeau'] = df['Besetzung'].apply(lambda x: hat_instrument(x, 'chal'))
df['hat_vla_amore'] = df['Besetzung'].apply(lambda x: hat_instrument(x, 'vla am'))

# 4. Auswertung nach Jahren
instrumenten_statistik = df.groupby('Jahr')[['hat_chalumeau', 'hat_vla_amore']].sum()

print("Statistik der besonderen Instrumente (Auszug):")
print(instrumenten_statistik.tail(15))

# 5. Bonus: Häufigste Tonarten pro Jahrgang
tonarten_top = df.groupby(['Jahr', 'Tonart']).size().unstack(fill_value=0)
print("\nTop Tonarten-Verteilung (Auszug):")
print(tonarten_top.iloc[:5, :5]) # Zeige nur einen kleinen Ausschnitt
