import sys

import matplotlib.pyplot as plt
import numpy as np

file = sys.argv[1]
print(file)

plot = np.loadtxt(file, delimiter=",", unpack=True)

fig = plt.figure(figsize=(4, 2))
plt.scatter(range(0, len(plot)), plot, marker="o", s=(72. / fig.dpi)**2)
plt.ylabel("Amps")
plt.xlabel("Samples")
plt.show()
