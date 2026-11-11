-- Keywords the owner asked the importer to learn: fast food / restaurants → Work meals, Zelle → Zelle payment, Mobile Deposit → Check payment,
-- phone carriers → Cell phone plan, checks written to yourself → Owner's draw. Only adds words; keeps what each category already has.
create or replace function pg_temp.add_kw(p_parent text, p_name text, p_words text) returns void language plpgsql as $$
begin
  update public.bank_categories c set keywords = (
    select string_agg(distinct w, ',') from unnest(string_to_array(coalesce(nullif(c.keywords, ''), '') || ',' || p_words, ',')) w where btrim(w) <> ''
  )
  from public.bank_categories p
  where c.parent_id = p.id and p.name = p_parent and c.name = p_name;
end $$;

-- "restaurant" now means a work meal, not a client meal.
update public.bank_categories c set keywords = nullif(regexp_replace(c.keywords, '(^|,)restaurants?(,|$)', ',', 'g'), '')
from public.bank_categories p where c.parent_id = p.id and p.name = 'Meals & Entertainment' and c.name = 'Restaurants-Client or staff';

select pg_temp.add_kw('Meals & Entertainment', 'Work meals',
  'restaurant,mcdonald,burger king,wendy,taco bell,kfc,chick-fil-a,popeyes,subway,sonic drive,jack in the box,domino,pizza hut,little caesars,papa john,chipotle,panda express,whataburger,five guys,in-n-out,dairy queen,arby,jersey mike,jimmy john,panera,denny,ihop,waffle house,cracker barrel,applebee,chili,olive garden,buffalo wild,texas roadhouse,el pollo loco,del taco,carl''s jr,raising cane,wingstop,taqueria,pizzeria,doordash,uber eats,grubhub,fast food');
select pg_temp.add_kw('Income', 'Zelle payment', 'zelle');
select pg_temp.add_kw('Income', 'Check payment', 'mobile deposit');
select pg_temp.add_kw('Office Expenses', 'Cell phone plan', 't-mobile,tmobile,sprint,verizon,at&t,cricket,metro by t-mobile,boost mobile,mint mobile,us mobile,visible,xfinity mobile,google fi,tracfone,straight talk');
select pg_temp.add_kw('Personal', 'Owner''s draw', 'owner draw,deposited or cashed check');
