/* Krapo Kwizz — comptes et jeu à plusieurs (en construction).
   Version provisoire : les pages s'affichent mais les fonctions en ligne arrivent bientôt. */
'use strict';
window.Social = {
  queueSync() {}, onDaily() {}, onScore() {}, leaveSalonView() {},
  accountCardHTML() { return ''; }, bindAccountCard() {},
  soon(title) {
    $('#app').innerHTML = `<span class="eyebrow">Bientôt</span><h1 class="display" style="font-size:clamp(2.2rem,8vw,3.4rem)">${title}</h1>
      <p class="lede">Les comptes, la comparaison des carnets, les battles et les parties en direct arrivent très bientôt. Le jeu reste entièrement utilisable sans compte.</p>
      <div class="row" style="margin-top:18px"><a class="btn primary" href="#jouer">Jouer</a></div>`;
  },
  viewEnsemble() { this.soon('Jouer ensemble'); },
  viewJoueur() { this.soon('Profil joueur'); },
  viewBattle() { this.soon('Battle'); },
  viewSalon() { this.soon('Partie en direct'); },
  viewPrivacy() { this.soon('Confidentialité'); },
};
