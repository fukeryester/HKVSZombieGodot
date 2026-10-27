from PIL import Image
from pathlib import Path
import itertools
for p in Path('assets/sprites').glob('*.png'):
    image=Image.open(p);alpha=image.getchannel('A');w,h=image.size
    values=[sum(v>80 for v in alpha.crop((0,y,int(w*.7),y+1)).get_flattened_data())<8 for y in range(h)]
    groups=[]
    for valid,group in itertools.groupby(enumerate(values),lambda x:x[1]):
        if valid:
            indexes=[x[0] for x in group]
            if len(indexes)>2:groups.append([indexes[0],indexes[-1]])
    print(p.stem,image.size,groups)
