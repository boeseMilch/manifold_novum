import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
import mn
mn.reset()
body = mn.box('crate', (1.0, 0.9, 0.7), m=mn.mat('crate', '#6a6f7a', 0.6, 0.3), bevel=0.04)
band = mn.box('band', (1.02, 0.2, 0.72), m=mn.mat('band', 'hazard', 0.5), bevel=0.02)
mn.tint(band); mn.outline([body, band])
mn.render('test/crate', passes=('beauty', 'normal', 'height', 'mask'))
