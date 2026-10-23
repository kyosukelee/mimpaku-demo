-- 架空データの投入(最初の1回だけ実行する)。 data/property.json から生成。
insert into public.properties (slug, name_ja, name_en, tagline_ja, tagline_en, area_ja, area_en, check_in, check_out, emergency_phone, emergency_note_ja, emergency_note_en, is_published)
values ('hiroshima-demo', 'ステイ中区(デモ)', 'Stay Naka-ku (Demo)', '広島の中心で過ごす、マンションの一室', 'An apartment in the heart of Hiroshima', '広島市中区', 'Naka-ku, Hiroshima', '15:00', '10:00', '000-0000-0000', '管理担当(デモ用の架空の番号です)。受付は24時間。', 'Property manager (a fictional number for this demo). Available 24 hours.', true)
on conflict (slug) do nothing;

insert into public.guide_items (property_id, category, display, sort_order, title_ja, title_en, body_ja, body_en, map_query, requires_code, is_published)
select * from (values
  ((select id from public.properties where slug = 'hiroshima-demo'), 'checkin', 'steps', 10, '鍵の受け取り', 'Getting in', '建物の入口で、部屋番号の呼び出しは不要です。そのまま中へお進みください。
玄関ドアの横に黒いキーボックスがあります。
暗証番号「0000」(デモ用)を入れて、鍵を取り出してください。
チェックアウトのときは、鍵をキーボックスに戻してください。', 'You do not need to ring the bell at the building entrance. Please go straight in.
There is a black key box next to the front door.
Enter the code “0000” (demo only) and take out the key.
At check-out, put the key back in the key box.', null, true, true),
  ((select id from public.properties where slug = 'hiroshima-demo'), 'checkin', 'keyvalue', 20, 'Wi-Fi', 'Wi-Fi', 'Wi-Fi名: StayNaka-Demo
パスワード: demo-wifi-0000', 'Wi-Fi name: StayNaka-Demo
Password: demo-wifi-0000', null, true, true),
  ((select id from public.properties where slug = 'hiroshima-demo'), 'checkin', 'bullets', 30, '家のルール', 'House rules', '22時から朝8時までは、お静かにお過ごしください。
室内は禁煙です。
ご案内の人数を超えての宿泊はできません。
お出かけのときは、窓と玄関の鍵を閉めてください。', 'Please keep quiet between 10 pm and 8 am.
Smoking is not allowed inside.
Only the registered number of guests may stay.
When you go out, please close the windows and lock the front door.', null, false, true),
  ((select id from public.properties where slug = 'hiroshima-demo'), 'checkin', 'text', 40, 'ゴミの出し方', 'Taking out the trash', 'キッチンの袋に「燃えるゴミ」「プラスチック」「ビン・缶」を分けてください。退出時に、玄関横の青いボックスへ入れてください。', 'Please sort trash in the kitchen into burnable, plastic, and bottles and cans. When you leave, put the bags in the blue box next to the front door.', null, false, true),
  ((select id from public.properties where slug = 'hiroshima-demo'), 'nearby', 'text', 50, '平和記念公園', 'Peace Memorial Park', '原爆資料館や慰霊碑がある公園です。徒歩で行けます(約15分、デモ用の目安)。', 'A park with the Peace Memorial Museum and memorials. Reachable on foot (about 15 minutes, a demo estimate).', '平和記念公園 広島', false, true),
  ((select id from public.properties where slug = 'hiroshima-demo'), 'nearby', 'text', 60, '原爆ドーム', 'Atomic Bomb Dome', '平和記念公園の近くにあります。徒歩で行けます(約15分、デモ用の目安)。', 'Close to Peace Memorial Park. Reachable on foot (about 15 minutes, a demo estimate).', '原爆ドーム 広島', false, true),
  ((select id from public.properties where slug = 'hiroshima-demo'), 'nearby', 'text', 70, '広島駅', 'Hiroshima Station', '新幹線やJRの駅です。路面電車で行けます(約20分、デモ用の目安)。', 'The Shinkansen and JR station. Take the streetcar (about 20 minutes, a demo estimate).', '広島駅', false, true),
  ((select id from public.properties where slug = 'hiroshima-demo'), 'nearby', 'text', 80, '宮島', 'Miyajima', '広島駅からJRとフェリーで行きます(約1時間)。海に立つ大鳥居で有名です。', 'Take the JR line and a ferry from Hiroshima Station (about 1 hour). Famous for the great torii gate in the sea.', '宮島 広島', false, true),
  ((select id from public.properties where slug = 'hiroshima-demo'), 'nearby', 'text', 90, 'コンビニ', 'Convenience store', '建物から徒歩3分のところにあります(デモ用の目安)。', 'A 3-minute walk from the building (a demo estimate).', 'コンビニ 広島市中区', false, true),
  ((select id from public.properties where slug = 'hiroshima-demo'), 'nearby', 'text', 100, 'お好み焼き店が多いエリア', 'Okonomiyaki area', '広島のお好み焼きを食べたいときは、中区の繁華街に店が集まっています。', 'If you want Hiroshima-style okonomiyaki, many restaurants are gathered in the downtown part of Naka-ku.', 'お好み焼き 広島市中区', false, true),
  ((select id from public.properties where slug = 'hiroshima-demo'), 'faq', 'text', 110, '鍵が開かないとき', 'The key box will not open', '暗証番号を、ゆっくりもう一度入れてください。それでも開かないときは、緊急連絡先にお電話ください。', 'Enter the code again, slowly. If it still does not open, please call the emergency contact.', null, false, true),
  ((select id from public.properties where slug = 'hiroshima-demo'), 'faq', 'text', 120, 'Wi-Fiがつながらないとき', 'The Wi-Fi does not connect', 'ルーターの電源を入れ直してください。ルーターはテレビの横にあります。', 'Turn the router off and on again. The router is next to the TV.', null, false, true),
  ((select id from public.properties where slug = 'hiroshima-demo'), 'faq', 'text', 130, '荷物を預けたいとき', 'I want to leave my luggage', 'チェックイン前とチェックアウト後の荷物の預かりは、事前にご相談ください。緊急連絡先までご連絡ください。', 'Please ask in advance about leaving luggage before check-in or after check-out. Contact the emergency number.', null, false, true),
  ((select id from public.properties where slug = 'hiroshima-demo'), 'faq', 'text', 140, 'チェックアウトのとき', 'At check-out', '10時までに、ゴミをまとめ、窓を閉め、鍵をキーボックスに戻してください。', 'By 10 am, gather the trash, close the windows, and return the key to the key box.', null, false, true),
  ((select id from public.properties where slug = 'hiroshima-demo'), 'urgent', 'text', 150, '緊急のとき', 'In an emergency', 'けが、病気、火事のときは、まず119番へ。事件や事故のときは110番へ。そのあとで、緊急連絡先にもお知らせください。', 'For injury, illness, or fire, call 119 first. For crime or accidents, call 110. Then also tell the emergency contact.', null, false, true)
) as v(property_id, category, display, sort_order, title_ja, title_en, body_ja, body_en, map_query, requires_code, is_published)
where not exists (
  select 1 from public.guide_items g where g.property_id = (select id from public.properties where slug = 'hiroshima-demo')
);
