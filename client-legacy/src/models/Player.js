class Player {

  constructor(name){
      this.name = name
      this.position = 0
      this.money = 1500
      this.properties = []
      this.inJail = false
      this.jailCounter = null
      this.jailCard = false
  }

  updatePosition(moveValue){
    if (this.inJail && this.jailCounter < 3){
      this.jailCounter += 1
    }
    else if (this.inJail && this.jailCounter === 3){
      this.jailCounter = null
      this.inJail = false
      this.position =  (this.position + moveValue) % 40
    }
    else {
      if (this.position + moveValue >= 40){
        this.money += 200
      }
    this.position =  (this.position + moveValue) % 40
  }
  }

  reset(){
    this.position = 0
    this.money = 1500
    this.properties = []
    this.inJail = false
    this.jailCounter = null
    this.jailCard = false
  }



  payForProperty(property){
    this.money -= (property.value)
  }

  payRent(property){
    this.money -= (property.rentValues[property.rentIndex])
  }

  receiveRent(property){
    this.money += (property.rentValues[property.rentIndex])
  }

  checkFunds(){
    return this.money
  }

  goToJail(){
    this.position = 10
    this.inJail = true
    this.jailCounter = 0
  }

  leaveJail(){
    if (!this.jailCard){
      alert("Don't have a Get Out of Jail Free card to use!")
    }
    else if (!this.inJail){
      alert("You're not in jail, no need to use that just now.")
    }
    else {
      this.inJail = false
      this.jailCounter = null
      this.jailCard = false
      alert("Used Get Out of Jail Free card.")
    }
  }

  leaveJailWithDouble(){
    this.inJail = false
    this.jailCounter = null
  }


  checkCompleteGroupOwned(property){
    let groupToCheck = property.group

    if (this.properties){
      let groupPropertiesOwned = this.properties.filter((property) => {
        return property.group === groupToCheck
      })

      if ((groupToCheck === "brown" || groupToCheck === "dark_blue") && groupPropertiesOwned.length === 2){
        return {check: true, group: groupPropertiesOwned}
      }
      else if (groupPropertiesOwned.length === 3){
        return {check: true, group: groupPropertiesOwned}
      }
      else {
        return {check: false, group: groupPropertiesOwned}
      }
    }
  }

  countPropertiesInGroup(property){
    let groupToCheck = property.group

    let groupPropertiesOwned = []

    if (this.properties){
      groupPropertiesOwned = this.properties.filter((property) => {
        return property.group === groupToCheck
      })
    }

    return groupPropertiesOwned.length
  }

  developProperty(property){

    let ownershipCheck = this.checkCompleteGroupOwned(property)

    let ownershipCheckResult = ownershipCheck.check

    if (!property.housePrice){
      alert("Can't build houses on this type of property")
    }
    else if (!ownershipCheck.check){
      alert("You must own all properties in a group before building houses")
    }
    else if (this.money < property.housePrice){
      alert("Not enough money to develop this property")
    }
    else if (property.rentIndex === 6){
      alert("Can't develop this property any further")
    }
    else{

      ownershipCheck.group.forEach((groupProperty) => {
        if(groupProperty.rentIndex === 0){
          groupProperty.rentIndex = 1
        }
      })
  
      let propertyRentIndexes = ownershipCheck.group.map((checkedProperty) => {
        return checkedProperty.rentIndex
      })

      propertyRentIndexes.sort((a, b) => {
        return a - b;
      })

      if (property.rentIndex !== propertyRentIndexes[0]){
        alert("Houses must be distributed evenly across properties in a group")
      }

      else {
        property.rentIndex += 1
        this.money -= property.housePrice
      }
    }
  }

}

export default Player