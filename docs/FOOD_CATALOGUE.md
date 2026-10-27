# 站点食物库来源与图片

47 种常见食物，每100g可食部，源自 USDA National Nutrient Database for Standard Reference, Legacy Release。源条目 NDB 编号、英文描述、生熟状态随数据保留。数据不是品牌商品标签；用餐时应按实际生熟状态称重。图像仅作食物示意。

官方存档：https://doi.org/10.15482/USDA.ADC/1529216
下载：https://www.ars.usda.gov/ARSUserFiles/80400525/Data/SR-Legacy/SR-Leg_ASC.zip
许可：CC0。营养值来自 FOOD_DES.txt / NUT_DATA.txt，208热量、203蛋白质、204脂肪、205碳水。

目标分配参考成人 AMDR 范围：https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/dietary-reference-intakes/tables/reference-values-macronutrients.html
预设比例为产品的可编辑规划起点，不是指南指定的增肌或减脂配方，也不自动估算个体热量需求。减脂30/45/25、增肌25/50/25、维持25/45/30（蛋白/碳水/脂肪，能量百分比）。

图像：使用 imagegen 生成一张 6列8行、白底、无文字的独立食物图集，非参考截图剪裁。提示要求每格一个可辨认的真实食物、柔和自然光、固定居中、按米饭/谷物、肉鱼、蛋奶豆、水果、蔬菜、油脂坚果、其他的顺序排列。未采用无法匹配来源的馒头格；生熟状态以文字为准。原图保存于 frontend/public/foods/atlas.png。

源ZIP SHA256: 79705f75a7306d0910ad16dd4d66a5caf602dad528b99b77c7a510bfaf3d6e14
