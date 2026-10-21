"""python3 tools/level_order.py  ->  the level order of src/levels.js, one strategy id per line.

The two shuffled groups were drawn once with Python's random module and then fixed:
  3-star 8-square strategies (those that reduce to a 7-square strategy): seed 20261021
  4-star 8-square strategies (the thirteen that do not reduce):          seed 20261022
Each group is shuffled from the order the strategies were listed in when the draw was made
(below).  test/levels.test.js runs this script and compares its output with src/levels.js.
"""
import random

FIXED = ['windowpane', 'shelf', 'column', 'center', 'right', 'top']
REDUCING = ['beta', 'theta', 'pi', 'rho', 'chi', 'omicron', 'phi', 'nu', 'tau', 'psi']
NEW = ['alpha', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'iota', 'kappa', 'lambda',
       'mu', 'xi', 'sigma', 'upsilon']

three = REDUCING[:]
random.Random(20261021).shuffle(three)
four = NEW[:]
random.Random(20261022).shuffle(four)
print('\n'.join(FIXED + three + four))
